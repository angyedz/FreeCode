import { loadConfig, saveConfig, type Config } from "./config";
import { COLORS, THEMES, applyTheme, printLogo, printBanner, askQuestion, askConfirm, interactiveMenu, type MenuOption } from "./ui";
import { runAgentLoop, type Message, SYSTEM_PROMPT, sessionUsage, estimateCost } from "./agent";
import { fetchModels } from "./models";
import { runOnboarding, loginFlow } from "./onboarding";
import { logoutAccount, pushAccount, pullAccount, applySyncedData } from "./account";
import { beginCheckpoint, commitCheckpoint, undoLast, listCheckpoints } from "./checkpoints";
import { runCommand } from "./tools";
import { loadProjectInstructions, composeSystemPrompt, FREECODE_TEMPLATE } from "./project";
import { newSessionId, saveSession, listSessions, loadSession } from "./sessions";
import { expandMentions } from "./context";
import { gitDiff, gitCommit, gitStatus } from "./git";
import fs from "fs/promises";
import path from "path";

const COMMANDS: { name: string; desc: string }[] = [
  { name: "/help", desc: "Show help and commands" },
  { name: "/model", desc: "Switch the active model" },
  { name: "/think", desc: "Set reasoning depth" },
  { name: "/plan", desc: "Toggle planning mode" },
  { name: "/theme", desc: "Change the color theme" },
  { name: "/login", desc: "Log in / register an account" },
  { name: "/sync", desc: "Sync settings with your account" },
  { name: "/logout", desc: "Log out of your account" },
  { name: "/init", desc: "Create a FREECODE.md project guide" },
  { name: "/resume", desc: "Resume a previous session" },
  { name: "/undo", desc: "Revert the last file changes" },
  { name: "/usage", desc: "Show token usage and cost" },
  { name: "/status", desc: "Show git status" },
  { name: "/diff", desc: "Show git diff" },
  { name: "/commit", desc: "Stage all and git commit" },
  { name: "/export", desc: "Export this session to Markdown" },
  { name: "/config", desc: "Open the setup wizard" },
  { name: "/clear", desc: "Clear the screen" },
  { name: "/exit", desc: "Quit FreeCode" },
];

// Resolve user input starting with "/" into a full command string.
// Exact match -> as typed; unique prefix -> autocompleted; else open palette.
async function resolveCommand(input: string): Promise<string | null> {
  const trimmed = input.trim();
  const [head, ...rest] = trimmed.split(/\s+/);
  const args = rest.join(" ");
  const exact = COMMANDS.find((c) => c.name === head);
  if (exact) return args ? `${exact.name} ${args}` : exact.name;

  const matches = COMMANDS.filter((c) => c.name.startsWith(head));
  if (matches.length === 1) return args ? `${matches[0].name} ${args}` : matches[0].name;

  const pool = matches.length > 0 ? matches : COMMANDS;
  const options: MenuOption<string>[] = pool.map((c) => ({
    label: c.name,
    value: c.name,
    hint: c.desc,
  }));
  const picked = await interactiveMenu<string>("Commands", options, { filterable: true });
  if (!picked) return null;
  return args ? `${picked} ${args}` : picked;
}

async function handleModelCommand(parts: string[], config: Config): Promise<Config> {
  const sub = parts[1];
  if (sub === "add") {
    const name = await askQuestion("Model display name: ");
    const id = await askQuestion("Model id: ");
    if (name.trim() && id.trim()) {
      config.customModels = [...(config.customModels || []), { name: name.trim(), id: id.trim() }];
      saveConfig(config);
      console.log(`${COLORS.green}Added model ${name.trim()}.${COLORS.reset}`);
    }
    return config;
  }
  if (sub && sub !== "list") {
    config.model = parts.slice(1).join(" ");
    saveConfig(config);
    console.log(`${COLORS.green}Model set to ${config.model}.${COLORS.reset}`);
    return config;
  }

  let apiModels: string[] = [];
  try { apiModels = await fetchModels(config); } catch {}
  const custom = (config.customModels || []).map((m) => ({
    label: m.name, value: m.id, hint: m.id,
  }));
  const options: MenuOption<string>[] = [
    ...apiModels.map((m) => ({ label: m, value: m, hint: "api" })),
    ...custom,
  ];

  if (options.length === 0) {
    console.log(`${COLORS.gray}No models available. Use "/model add".${COLORS.reset}`);
    return config;
  }
  const current = options.findIndex((o) => o.value === config.model);
  const picked = await interactiveMenu<string>("Select active model", options, {
    filterable: true,
    initialIndex: current >= 0 ? current : 0,
  });
  if (picked) {
    config.model = picked;
    saveConfig(config);
    console.log(`${COLORS.green}Model set to ${picked}.${COLORS.reset}`);
  }
  return config;
}

async function handleCommand(input: string, config: Config): Promise<{ config: Config; exit: boolean }> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0];
  switch (cmd) {
    case "/exit":
      return { config, exit: true };
    case "/help":
      showHelp();
      return { config, exit: false };
    case "/clear":
      console.clear();
      printLogo(config.model, config.baseURL);
      return { config, exit: false };
    case "/config":
      config = await runSetup(config);
      return { config, exit: false };
    case "/plan":
      config.planningMode = !config.planningMode;
      saveConfig(config);
      console.log(`${COLORS.green}Planning mode ${config.planningMode ? "on" : "off"}.${COLORS.reset}`);
      return { config, exit: false };
    case "/model":
      config = await handleModelCommand(parts, config);
      return { config, exit: false };

    case "/think": {
      const levels: MenuOption<string>[] = [
        { label: "none", value: "none", hint: "no extra reasoning" },
        { label: "low", value: "low", hint: "brief reasoning" },
        { label: "medium", value: "medium", hint: "balanced" },
        { label: "high", value: "high", hint: "deep reasoning" },
        { label: "max", value: "max", hint: "maximum reasoning" },
      ];
      const cur = levels.findIndex((l) => l.value === config.thinkingLevel);
      const picked = await interactiveMenu<string>("Reasoning depth", levels, {
        initialIndex: cur >= 0 ? cur : 2,
      });
      if (picked) {
        config.thinkingLevel = picked;
        saveConfig(config);
        console.log(`${COLORS.green}Reasoning set to ${picked}.${COLORS.reset}`);
      }
      return { config, exit: false };
    }

    case "/theme": {
      const opts: MenuOption<string>[] = Object.entries(THEMES).map(([k, t]) => ({ label: t.label, value: k }));
      const cur = opts.findIndex((o) => o.value === config.theme);
      const picked = await interactiveMenu<string>("Color theme", opts, { initialIndex: cur >= 0 ? cur : 0 });
      if (picked) {
        config.theme = picked;
        applyTheme(picked);
        saveConfig(config);
        console.clear();
        printLogo(config.model, config.baseURL);
        console.log(`${COLORS.green}Theme set to ${picked}.${COLORS.reset}`);
      }
      return { config, exit: false };
    }
    case "/login":
      config = await loginFlow(config);
      saveConfig(config);
      applyTheme(config.theme);
      if (config.mode === "cloud" && config.account?.token) {
        try { await pushAccount(config); } catch {}
      }
      return { config, exit: false };
    case "/logout":
      await logoutAccount(config);
      config.account = undefined;
      config.mode = "local";
      saveConfig(config);
      console.log(`${COLORS.green}Logged out.${COLORS.reset}`);
      return { config, exit: false };
    case "/sync": {
      if (!config.account?.token) {
        console.log(`${COLORS.gray}Not logged in. Use /login first.${COLORS.reset}`);
        return { config, exit: false };
      }
      try {
        const remote = await pullAccount(config);
        if (remote && Object.keys(remote).length) applySyncedData(config, remote);
        await pushAccount(config);
        saveConfig(config);
        applyTheme(config.theme);
        console.log(`${COLORS.green}✓ Settings synced.${COLORS.reset}`);
      } catch (e: any) {
        console.log(`${COLORS.red}${e?.message || e}${COLORS.reset}`);
      }
      return { config, exit: false };
    }
    case "/init": {
      const target = path.resolve(process.cwd(), "FREECODE.md");
      try {
        await fs.access(target);
        console.log(`${COLORS.gray}FREECODE.md already exists. Leaving it untouched.${COLORS.reset}`);
      } catch {
        await fs.writeFile(target, FREECODE_TEMPLATE, "utf-8");
        console.log(`${COLORS.green}Created FREECODE.md. Edit it to guide FreeCode on this project.${COLORS.reset}`);
      }
      return { config, exit: false };
    }
    case "/undo": {
      const msg = await undoLast();
      console.log(`${COLORS.green}${msg}${COLORS.reset}`);
      return { config, exit: false };
    }
    case "/usage": {
      const cost = estimateCost(config.model, sessionUsage.promptTokens, sessionUsage.completionTokens);
      console.log(`\n${COLORS.bold}Token usage this session${COLORS.reset}`);
      console.log(`  ${COLORS.gray}Requests:${COLORS.reset}   ${sessionUsage.requests}`);
      console.log(`  ${COLORS.gray}Input:${COLORS.reset}      ${sessionUsage.promptTokens} tok`);
      console.log(`  ${COLORS.gray}Output:${COLORS.reset}     ${sessionUsage.completionTokens} tok`);
      console.log(`  ${COLORS.gray}Total:${COLORS.reset}      ${sessionUsage.totalTokens} tok`);
      console.log(`  ${COLORS.gray}Est. cost:${COLORS.reset}  ~$${cost.toFixed(4)} ${COLORS.gray}(model ${config.model})${COLORS.reset}\n`);
      return { config, exit: false };
    }
    case "/status": {
      console.log(await gitStatus());
      return { config, exit: false };
    }
    case "/diff": {
      console.log(await gitDiff(parts.slice(1).join(" ")));
      return { config, exit: false };
    }
    case "/commit": {
      const message = parts.slice(1).join(" ");
      console.log(await gitCommit(message));
      return { config, exit: false };
    }
    default:
      console.log(`${COLORS.red}Unknown command: ${cmd}${COLORS.reset} ${COLORS.gray}(type / and press Enter to browse)${COLORS.reset}`);
      return { config, exit: false };
  }
}

function showHelp() {
  console.log(`\n${COLORS.bold}${COLORS.orange}FreeCode${COLORS.reset} ${COLORS.gray}- Claude Code-style coding agent${COLORS.reset}\n`);
  console.log(`${COLORS.bold}Usage${COLORS.reset}`);
  console.log(`  Type a request and press Enter to chat with the agent.`);
  console.log(`  Type ${COLORS.orange}/${COLORS.reset} and press Enter to browse slash commands.\n`);
  console.log(`${COLORS.bold}Slash commands${COLORS.reset}`);
  for (const c of COMMANDS) {
    console.log(`  ${COLORS.orange}${c.name.padEnd(10)}${COLORS.reset} ${COLORS.gray}${c.desc}${COLORS.reset}`);
  }
  console.log(`\n${COLORS.bold}Input modes${COLORS.reset}`);
  console.log(`  ${COLORS.orange}!cmd${COLORS.reset}      ${COLORS.gray}Run a shell command directly (e.g. !ls -la).${COLORS.reset}`);
  console.log(`  ${COLORS.orange}@path${COLORS.reset}     ${COLORS.gray}Attach a file's contents to your message as context.${COLORS.reset}`);
  console.log(`  ${COLORS.gray}FREECODE.md in the project root is auto-loaded into the system prompt.${COLORS.reset}`);
  console.log(`\n${COLORS.bold}Navigation${COLORS.reset}`);
  console.log(`  ${COLORS.gray}Use \u2191/\u2193 to move, \u21b5 to select, esc to cancel in any menu.${COLORS.reset}\n`);
}

async function runSetup(config: Config): Promise<Config> {
  console.log(`\n${COLORS.bold}${COLORS.orange}[Config] FreeCode Config Wizard${COLORS.reset}\n`);
  const baseURL = await askQuestion(`API base URL ${COLORS.gray}(${config.baseURL})${COLORS.reset}: `);
  if (baseURL.trim()) config.baseURL = baseURL.trim();
  const apiKey = await askQuestion(`API key ${COLORS.gray}(${config.apiKey ? "set" : "empty"})${COLORS.reset}: `);
  if (apiKey.trim()) config.apiKey = apiKey.trim();

  config.autoApprove = await askConfirm("Auto-approve tool actions?", config.autoApprove);
  config.planningMode = await askConfirm("Enable planning mode?", config.planningMode);

  const levels: MenuOption<Config["thinkingLevel"]>[] = [
    { label: "none", value: "none", hint: "no extra reasoning" },
    { label: "low", value: "low", hint: "brief reasoning" },
    { label: "medium", value: "medium", hint: "balanced" },
    { label: "high", value: "high", hint: "deep reasoning" },
    { label: "max", value: "max", hint: "maximum reasoning" },
  ];
  const curLevel = levels.findIndex((l) => l.value === config.thinkingLevel);
  const lvl = await interactiveMenu("Reasoning depth", levels, {
    initialIndex: curLevel >= 0 ? curLevel : 2,
  });
  if (lvl) config.thinkingLevel = lvl;

  await saveConfig(config);
  console.log(`${COLORS.green}Configuration saved.${COLORS.reset}\n`);
  return config;
}

// Build the initial system message, folding in FREECODE.md project instructions.
async function makeSystemMessage(): Promise<Message> {
  const instructions = await loadProjectInstructions();
  if (instructions) {
    console.log(`${COLORS.gray}Loaded project instructions from FREECODE.md.${COLORS.reset}`);
  }
  return { role: "system", content: composeSystemPrompt(SYSTEM_PROMPT, instructions) };
}

// Render a session transcript as Markdown for /export.
function sessionToMarkdown(messages: Message[]): string {
  const lines: string[] = [`# FreeCode session`, "", `_Exported ${new Date().toISOString()}_`, ""];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      lines.push(`## User`, "", (m.content || "").trim(), "");
    } else if (m.role === "assistant") {
      if (m.content && m.content.trim()) lines.push(`## Assistant`, "", m.content.trim(), "");
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          lines.push(`> tool: \`${tc.function?.name}\` ${tc.function?.arguments || ""}`.trim(), "");
        }
      }
    } else if (m.role === "tool") {
      const body = (m.content || "").trim();
      const clipped = body.length > 2000 ? body.slice(0, 2000) + "\n... [truncated]" : body;
      lines.push(`<details><summary>tool result: ${m.name}</summary>`, "", "```", clipped, "```", "", "</details>", "");
    }
  }
  return lines.join("\n");
}

async function main() {
  let config = await loadConfig();
  applyTheme(config.theme);
  const argv = process.argv.slice(2);

  if (argv[0] === "--help" || argv[0] === "-h") {
    showHelp();
    return;
  }
  if (argv[0] === "config" || argv[0] === "setup") {
    config = await runSetup(config);
    return;
  }

  if (!config.onboarded) {
    config = await runOnboarding(config);
  } else if (!config.apiKey) {
    console.log(`${COLORS.gray}No API key found. Starting setup.${COLORS.reset}`);
    config = await runSetup(config);
  }

  // One-shot mode: pass a prompt as arguments to run once and exit.
  if (argv.length > 0) {
    const expanded = await expandMentions(argv.join(" "));
    const messages: Message[] = [await makeSystemMessage(), { role: "user", content: expanded }];
    await runAgentLoop(messages, config);
    return;
  }

  printLogo(config.model, config.baseURL);
  console.log(`${COLORS.gray}Type ${COLORS.orange}/${COLORS.gray} and press Enter to browse commands. Type your request to start.${COLORS.reset}\n`);

  let sessionId = newSessionId();
  const messages: Message[] = [await makeSystemMessage()];
  while (true) {
    const input = await askQuestion(`${COLORS.orange}freecode${COLORS.reset} ${COLORS.gray}\u203a${COLORS.reset} `);
    const trimmed = input.trim();
    if (!trimmed) continue;

    // Shell mode: lines starting with ! run directly in the shell.
    if (trimmed.startsWith("!")) {
      const cmd = trimmed.slice(1).trim();
      if (cmd) console.log(await runCommand(cmd));
      continue;
    }

    if (trimmed.startsWith("/")) {
      const resolved = await resolveCommand(trimmed);
      if (!resolved) continue;
      const head = resolved.split(/\s+/)[0];

      // /resume and /export need the live message array, so handle them here.
      if (head === "/resume") {
        const sessions = await listSessions();
        if (!sessions.length) {
          console.log(`${COLORS.gray}No saved sessions yet.${COLORS.reset}`);
          continue;
        }
        const picked = await interactiveMenu(
          "Resume session",
          sessions.map((s) => ({
            label: s.title || s.id,
            value: s.id,
            hint: `${s.count} msgs \u00b7 ${s.updated.slice(0, 16).replace("T", " ")}`,
          })),
          { filterable: true, pageSize: 10 },
        );
        if (!picked) continue;
        const loaded = await loadSession(picked);
        if (!loaded) {
          console.log(`${COLORS.red}Could not load that session.${COLORS.reset}`);
          continue;
        }
        messages.length = 0;
        for (const m of loaded) messages.push(m);
        sessionId = picked;
        console.log(`${COLORS.green}Resumed session ${picked} (${loaded.length} messages).${COLORS.reset}`);
        continue;
      }
      if (head === "/export") {
        const arg = resolved.split(/\s+/).slice(1).join(" ").trim();
        const out = path.resolve(process.cwd(), arg || `freecode-session-${sessionId}.md`);
        await fs.writeFile(out, sessionToMarkdown(messages), "utf-8");
        console.log(`${COLORS.green}Exported session to ${out}.${COLORS.reset}`);
        continue;
      }

      const result = await handleCommand(resolved, config);
      config = result.config;
      if (result.exit) break;
      continue;
    }

    const expanded = await expandMentions(trimmed);
    messages.push({ role: "user", content: expanded });
    beginCheckpoint(trimmed);
    try {
      await runAgentLoop(messages, config);
    } finally {
      commitCheckpoint();
      await saveSession(sessionId, messages, trimmed);
    }
  }

  console.log(`${COLORS.gray}Goodbye.${COLORS.reset}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, err);
  process.exit(1);
});
