import { COLORS, startSpinner, stopSpinner, updateSpinner, askConfirm, renderDiff, renderMarkdown } from "./ui";
import {
  toolDefinitions,
  listDir,
  findFiles,
  viewFile,
  writeFile,
  patchFile,
  runCommand,
  webSearch,
  fetchUrl,
  grepSearch,
  createDir,
  deleteFile,
  moveFile,
  appendFile,
  listDirRecursive
} from "./tools";
import type { Config } from "./config";

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export const SYSTEM_PROMPT = `You are FreeCode, a direct, action-oriented AI coding assistant.
You inspect codebases, execute commands, modify files, and solve tasks directly.

THINKING REQUIREMENT:
- You MUST think and reason deeply before answering every request and before calling any tool.
- If your active model does not have native reasoning (like gpt-4o), you MUST start your response with <thinking> followed by your step-by-step analysis, plan, and logic, and then close it with </thinking> before providing the final answer. Even for simple questions, you must analyze them in <thinking> tags.
- Your final answer MUST be written OUTSIDE of the <thinking>...</thinking> tags. Do not put your actual reply to the user inside <thinking> tags.

SELF-CORRECTION & ERROR HANDLING:
- If a tool returns an error, warning, or failing tests, you MUST analyze the failure, correct your code, and run verification again.
- Do not stop until all tests pass and compilation succeeds. Iteratively refine your edits based on error logs.

CRITICAL DIRECTIONS:
- Avoid passive, polite, or hedging phrases such as "Let me check...", "I will try to...", "I'll run...", or "I am going to...".
- Speak directly and state the actions you are taking. For example, say: "Searching codebase for X", "Applying patch to Y", or "Executing command Z".
- No emojis anywhere in your messages or output. Use clean monochrome characters like >, -, *, [, ].
- Work step-by-step. Break tasks into research, plan, execute, and verify phases.
- When the user asks to find something on the internet, list contents of a directory, or search code, you MUST present the findings briefly, clearly, and directly. Do not output excessive or bloated text. Give a concise summary of the key facts.
- Verify your work by running tests or compilation checks.
`;

export async function runAgentLoop(messages: Message[], config: Config) {
  if (messages.length === 0 || messages[0].role !== "system") {
    messages.unshift({ role: "system", content: SYSTEM_PROMPT });
  }

  let loopCount = 0;

  while (true) {
    loopCount++;
    
    const url = `${config.baseURL.replace(/\/$/, "")}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    startSpinner("Preparing request...");
    
    // Configure thinking / reasoning parameters
    const requestBody: any = {
      model: config.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
        ...(m.name && { name: m.name }),
      })),
      tools: toolDefinitions,
      stream: true,
    };

    if (config.thinkingLevel !== "none") {
      if (config.thinkingLevel === "low") {
        requestBody.reasoning_effort = "low";
        requestBody.max_thinking_tokens = 1024;
      } else if (config.thinkingLevel === "medium") {
        requestBody.reasoning_effort = "medium";
        requestBody.max_thinking_tokens = 2048;
      } else if (config.thinkingLevel === "high") {
        requestBody.reasoning_effort = "high";
        requestBody.max_thinking_tokens = 4096;
      } else if (config.thinkingLevel === "max") {
        requestBody.reasoning_effort = "high";
        requestBody.max_thinking_tokens = 8192;
      }
    }

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (e: any) {
      stopSpinner(false, `Failed to connect to API: ${e.message}`);
      return;
    }

    if (!response.ok) {
      const errText = await response.text();
      stopSpinner(false, `API returned error (${response.status}): ${errText}`);
      return;
    }

    stopSpinner(true);

    const reader = response.body?.getReader();
    if (!reader) {
      console.log(`${COLORS.red}Error: Response body is not readable.${COLORS.reset}`);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    
    let assistantText = "";
    let reasoningText = "";
    const toolCalls: Record<number, { id?: string; name?: string; arguments: string }> = {};
    
    let hasShownReasoningHeader = false;
    let hasClosedReasoning = false;
    let hasShownResponseHeader = false;
    let accumulatedText = "";
    let parseIndex = 0;
    let inThinkingTag = false;
    let hasStreamedResponseText = false;
    let lastPrintedFieldLength = 0;
    let activeToolName = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === "data: [DONE]") continue;
        if (trimmed.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const choice = parsed.choices?.[0];
            if (!choice) continue;
            
            const delta = choice.delta;
            
            // 1. Check for DeepSeek / R1 reasoning content
            const reasoning = delta.reasoning_content || delta.thinking || delta.thought;
            if (reasoning) {
              if (!hasShownReasoningHeader) {
                console.log(`\n${COLORS.gray}┌─── Thinking Process ──────────────────────────────────────────${COLORS.reset}`);
                hasShownReasoningHeader = true;
              }
              process.stdout.write(`${COLORS.gray}${reasoning}${COLORS.reset}`);
              reasoningText += reasoning;
            }

            // 2. Check for assistant text response
            const content = delta.content;
            if (content) {
              accumulatedText += content;
              
              while (parseIndex < accumulatedText.length) {
                if (!inThinkingTag) {
                  const tagIndex = accumulatedText.indexOf("<thinking>", parseIndex);
                  if (tagIndex === -1) {
                    const remaining = accumulatedText.slice(parseIndex);
                    if ("<thinking>".startsWith(remaining) && remaining.length > 0) {
                      break;
                    } else {
                      const normalChunk = accumulatedText.slice(parseIndex);
                      if (normalChunk) {
                        if (hasShownReasoningHeader && !hasClosedReasoning) {
                          console.log(`\n${COLORS.gray}└───────────────────────────────────────────────────────────────${COLORS.reset}`);
                          hasClosedReasoning = true;
                        }
                        if (!hasShownResponseHeader) {
                          console.log(`\n${COLORS.bold}${COLORS.cyan}> Response:${COLORS.reset}`);
                          hasShownResponseHeader = true;
                        }
                        process.stdout.write(normalChunk);
                        assistantText += normalChunk;
                        hasStreamedResponseText = true;
                      }
                      parseIndex = accumulatedText.length;
                    }
                  } else {
                    const normalChunk = accumulatedText.slice(parseIndex, tagIndex);
                    if (normalChunk) {
                      if (hasShownReasoningHeader && !hasClosedReasoning) {
                        console.log(`\n${COLORS.gray}└───────────────────────────────────────────────────────────────${COLORS.reset}`);
                        hasClosedReasoning = true;
                      }
                      if (!hasShownResponseHeader) {
                        console.log(`\n${COLORS.bold}${COLORS.cyan}> Response:${COLORS.reset}`);
                        hasShownResponseHeader = true;
                      }
                      process.stdout.write(normalChunk);
                      assistantText += normalChunk;
                      hasStreamedResponseText = true;
                    }
                    
                    if (!hasShownReasoningHeader) {
                      console.log(`\n${COLORS.gray}┌─── Thinking Process ──────────────────────────────────────────${COLORS.reset}`);
                      hasShownReasoningHeader = true;
                    }
                    
                    inThinkingTag = true;
                    parseIndex = tagIndex + "<thinking>".length;
                  }
                } else {
                  const closeIndex = accumulatedText.indexOf("</thinking>", parseIndex);
                  if (closeIndex === -1) {
                    const remaining = accumulatedText.slice(parseIndex);
                    if ("</thinking>".startsWith(remaining) && remaining.length > 0) {
                      break;
                    } else {
                      const reasoningChunk = accumulatedText.slice(parseIndex);
                      if (reasoningChunk) {
                        process.stdout.write(`${COLORS.gray}${reasoningChunk}${COLORS.reset}`);
                        reasoningText += reasoningChunk;
                      }
                      parseIndex = accumulatedText.length;
                    }
                  } else {
                    const reasoningChunk = accumulatedText.slice(parseIndex, closeIndex);
                    if (reasoningChunk) {
                      process.stdout.write(`${COLORS.gray}${reasoningChunk}${COLORS.reset}`);
                      reasoningText += reasoningChunk;
                    }
                    
                    if (hasShownReasoningHeader && !hasClosedReasoning) {
                      console.log(`\n${COLORS.gray}└───────────────────────────────────────────────────────────────${COLORS.reset}`);
                      hasClosedReasoning = true;
                    }
                    
                    inThinkingTag = false;
                    parseIndex = closeIndex + "</thinking>".length;
                  }
                }
              }
            }

            // 3. Check for tool calls
            const tcs = delta.tool_calls;
            if (tcs) {
              for (const tc of tcs) {
                const idx = tc.index;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = { arguments: "" };
                }
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) {
                  toolCalls[idx].name = tc.function.name;
                  activeToolName = tc.function.name;
                }
                if (tc.function?.arguments) {
                  toolCalls[idx].arguments += tc.function.arguments;
                  
                  if (activeToolName === "write_file" || activeToolName === "patch_file") {
                    const fieldToStream = activeToolName === "write_file" ? "content" : "replace";
                    const extracted = extractStreamingField(toolCalls[idx].arguments, fieldToStream);
                    if (extracted.length > lastPrintedFieldLength) {
                      const newChunk = extracted.slice(lastPrintedFieldLength);
                      if (lastPrintedFieldLength === 0) {
                        console.log(`\n${COLORS.gray}┌─── Streaming Code Changes ────────────────────────────────────${COLORS.reset}`);
                      }
                      process.stdout.write(`${COLORS.green}${newChunk}${COLORS.reset}`);
                      lastPrintedFieldLength = extracted.length;
                    }
                  }
                }
              }
            }
          } catch (err) {
            // Ignore incomplete lines
          }
        }
      }
    }

    if (inThinkingTag) {
      inThinkingTag = false;
    }

    if (hasShownReasoningHeader && !hasClosedReasoning) {
      console.log(`\n${COLORS.gray}└───────────────────────────────────────────────────────────────${COLORS.reset}`);
      hasClosedReasoning = true;
    }

    if (lastPrintedFieldLength > 0) {
      console.log(`\n${COLORS.gray}└───────────────────────────────────────────────────────────────${COLORS.reset}`);
    }

    if (!assistantText.trim() && reasoningText.trim()) {
      assistantText = reasoningText;
      if (!hasShownResponseHeader) {
        console.log(`\n${COLORS.bold}${COLORS.cyan}> Response:${COLORS.reset}`);
        hasShownResponseHeader = true;
      }
    }

    if (hasShownResponseHeader && assistantText) {
      if (hasStreamedResponseText) {
        const columns = (process.stdout.columns && process.stdout.columns > 0) ? process.stdout.columns : 80;
        const linesToClear = countLines(assistantText, columns);
        if (linesToClear > 0) {
          process.stdout.write("\r\x1b[2K");
          for (let i = 1; i < linesToClear; i++) {
            process.stdout.write("\x1b[1A\x1b[2K");
          }
          process.stdout.write("\r");
        }
      }
      const rendered = renderMarkdown(assistantText);
      console.log(rendered);
    } else {
      console.log(); // Add newline after response stream finishes
    }

    const toolCallList = Object.values(toolCalls).map(tc => ({
      id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
      type: "function",
      function: {
        name: tc.name || "",
        arguments: tc.arguments,
      },
    }));

    messages.push({
      role: "assistant",
      content: assistantText || null,
      tool_calls: toolCallList.length > 0 ? toolCallList : undefined,
    });

    if (toolCallList.length === 0) {
      break;
    }

    for (const toolCall of toolCallList) {
      const toolName = toolCall.function.name;
      let args: any = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (err) {
        console.log(`${COLORS.red}Error parsing arguments for tool ${toolName}: ${toolCall.function.arguments}${COLORS.reset}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolName,
          content: `Error parsing arguments: ${err}`,
        });
        continue;
      }

      console.log(`\n${COLORS.bold}${COLORS.yellow}[Tool Execution Request]${COLORS.reset}`);
      
      let detailLine = "";
      if (toolName === "run_command") {
        detailLine = `Command: ${COLORS.bold}${COLORS.cyan}${args.command}${COLORS.reset}`;
      } else if (toolName === "list_dir") {
        detailLine = `Listing: ${COLORS.cyan}${args.dirPath || "."}${COLORS.reset}`;
      } else if (toolName === "find_files") {
        detailLine = `Pattern: ${COLORS.cyan}${args.pattern}${COLORS.reset}`;
      } else if (toolName === "view_file") {
        detailLine = `Reading: ${COLORS.cyan}${args.filePath}${COLORS.reset}${
          args.startLine ? ` (lines ${args.startLine}-${args.endLine || "end"})` : ""
        }`;
      } else if (toolName === "write_file") {
        detailLine = `Writing: ${COLORS.cyan}${args.filePath}${COLORS.reset} (${args.content.length} chars)`;
      } else if (toolName === "patch_file") {
        detailLine = `Patching: ${COLORS.cyan}${args.filePath}${COLORS.reset}`;
      } else if (toolName === "web_search") {
        detailLine = `Searching: ${COLORS.cyan}${args.query}${COLORS.reset}`;
      } else if (toolName === "fetch_url") {
        detailLine = `Fetching: ${COLORS.cyan}${args.url}${COLORS.reset}`;
      } else if (toolName === "grep_search") {
        detailLine = `Grep: ${COLORS.cyan}${args.pattern}${COLORS.reset}${
          args.globPattern ? ` in ${args.globPattern}` : ""
        }`;
      } else if (toolName === "create_dir") {
        detailLine = `Mkdir: ${COLORS.cyan}${args.dirPath}${COLORS.reset}`;
      } else if (toolName === "delete_file") {
        detailLine = `Deleting: ${COLORS.cyan}${args.filePath}${COLORS.reset}`;
      } else if (toolName === "move_file") {
        detailLine = `Moving: ${COLORS.cyan}${args.sourcePath}${COLORS.reset} -> ${COLORS.cyan}${args.destPath}${COLORS.reset}`;
      } else if (toolName === "append_file") {
        detailLine = `Appending: ${COLORS.cyan}${args.filePath}${COLORS.reset} (${args.content.length} chars)`;
      } else if (toolName === "list_dir_recursive") {
        detailLine = `Recursive: ${COLORS.cyan}${args.dirPath || "."}${COLORS.reset}`;
      } else {
        detailLine = `Args: ${JSON.stringify(args)}`;
      }

      const headerTitle = ` Tool Request: ${toolName} `;
      const borderLength = Math.max(40, headerTitle.length + 10);
      const rightBorder = "─".repeat(borderLength - headerTitle.length - 4);
      
      console.log(`\n${COLORS.gray}┌───${COLORS.reset}${COLORS.bold}${COLORS.yellow}${headerTitle}${COLORS.reset}${COLORS.gray}${rightBorder}${COLORS.reset}`);
      console.log(`${COLORS.gray}│${COLORS.reset} ${detailLine}`);
      console.log(`${COLORS.gray}└───────────────────────────────────────────────────────────────${COLORS.reset}`);

      if (toolName === "patch_file") {
        renderDiff(args.filePath, args.search, args.replace);
      }

      let approved = config.autoApprove;
      if (toolName === "run_command" && !config.autoApprove) {
        approved = false;
      }

      if (!approved) {
        approved = await askConfirm("Approve tool execution?");
      }

      if (!approved) {
        console.log(`${COLORS.red}[ERR] Tool execution denied by user.${COLORS.reset}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolName,
          content: "Error: Tool execution denied by user.",
        });
        continue;
      }

      startSpinner(`Running ${toolName}...`);
      let result = "";
      try {
        switch (toolName) {
          case "list_dir":
            result = await listDir(args.dirPath);
            break;
          case "find_files":
            result = await findFiles(args.pattern);
            break;
          case "view_file":
            result = await viewFile(args.filePath, args.startLine, args.endLine);
            break;
          case "write_file":
            result = await writeFile(args.filePath, args.content);
            break;
          case "patch_file":
            result = await patchFile(args.filePath, args.search, args.replace);
            break;
          case "run_command":
            result = await runCommand(args.command);
            break;
          case "web_search":
            result = await webSearch(args.query);
            break;
          case "fetch_url":
            result = await fetchUrl(args.url);
            break;
          case "grep_search":
            result = await grepSearch(args.pattern, args.globPattern);
            break;
          case "create_dir":
            result = await createDir(args.dirPath);
            break;
          case "delete_file":
            result = await deleteFile(args.filePath);
            break;
          case "move_file":
            result = await moveFile(args.sourcePath, args.destPath);
            break;
          case "append_file":
            result = await appendFile(args.filePath, args.content);
            break;
          case "list_dir_recursive":
            result = await listDirRecursive(args.dirPath);
            break;
          default:
            result = `Error: Unknown tool ${toolName}`;
        }
        stopSpinner(true, `Finished ${toolName}`);
      } catch (err: any) {
        stopSpinner(false, `Failed ${toolName}`);
        result = `Error executing tool: ${err.message}`;
      }

      const lines = result.split("\n");
      const preview = lines.slice(0, 15).join("\n") + (lines.length > 15 ? `\n... [Results truncated. Total lines: ${lines.length}]` : "");
      console.log(`${COLORS.gray}Results Preview:\n${preview}${COLORS.reset}\n`);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: result,
      });
    }
  }
}


function countLines(text: string, columns: number): number {
  const lines = text.split("\n");
  let total = 0;
  for (const line of lines) {
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, "");
    total += Math.max(1, Math.ceil(cleanLine.length / columns));
  }
  return total;
}

function extractStreamingField(argumentsStr: string, fieldName: string): string {
  const regex = new RegExp(`"${fieldName}"\\s*:\\s*"`);
  const match = argumentsStr.match(regex);
  if (!match) return "";
  
  const startIndex = match.index! + match[0].length;
  let result = "";
  let escaped = false;
  for (let i = startIndex; i < argumentsStr.length; i++) {
    const char = argumentsStr[i];
    if (escaped) {
      if (char === "n") result += "\n";
      else if (char === "t") result += "\t";
      else if (char === "r") result += "\r";
      else result += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      break;
    } else {
      result += char;
    }
  }
  return result;
}

