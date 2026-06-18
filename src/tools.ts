import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

// Define the tool interfaces that will be sent to the OpenAI compatible API
export const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "list_dir",
      description: "List contents of a directory (non-recursively) to see files and folders.",
      parameters: {
        type: "object",
        properties: {
          dirPath: {
            type: "string",
            description: "Directory path relative to workspace root (use '.' for root).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_files",
      description: "Find files matching a glob pattern (e.g. 'src/**/*.ts' or '*.json') inside the workspace.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern to search for.",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "view_file",
      description: "Read the contents of a text file. You can optionally specify a line range.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "File path relative to workspace root.",
          },
          startLine: {
            type: "number",
            description: "Start line number (1-indexed, inclusive).",
          },
          endLine: {
            type: "number",
            description: "End line number (1-indexed, inclusive).",
          },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Create a new file or completely overwrite an existing file with new content.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "File path relative to workspace root.",
          },
          content: {
            type: "string",
            description: "The complete content to write into the file.",
          },
        },
        required: ["filePath", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "patch_file",
      description: "Edit an existing file by replacing a unique matching block of code. This is much faster and cheaper than writing the entire file.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "File path relative to workspace root.",
          },
          search: {
            type: "string",
            description: "The exact block of code to search for. Must be a unique block in the file.",
          },
          replace: {
            type: "string",
            description: "The block of code to replace the search block with.",
          },
        },
        required: ["filePath", "search", "replace"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description: "Run a shell command on the host machine in the workspace directory. Use this to install dependencies, run tests, build the project, or run other shell operations.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute.",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web for information using DuckDuckGo search engine.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query term.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fetch_url",
      description: "Fetch the text content of a web page/URL, stripping HTML tags.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The web page URL to fetch.",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "grep_search",
      description: "Find occurrences of a regular expression pattern in the workspace files.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "The RegExp pattern to match in files.",
          },
          globPattern: {
            type: "string",
            description: "Optional glob pattern to restrict search files (e.g. '*.ts').",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_dir",
      description: "Create a new directory recursively.",
      parameters: {
        type: "object",
        properties: {
          dirPath: {
            type: "string",
            description: "The directory path to create.",
          },
        },
        required: ["dirPath"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_file",
      description: "Delete a file or directory recursively from the workspace.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "The file path to delete.",
          },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "move_file",
      description: "Move or rename a file or directory.",
      parameters: {
        type: "object",
        properties: {
          sourcePath: {
            type: "string",
            description: "The source path.",
          },
          destPath: {
            type: "string",
            description: "The destination path.",
          },
        },
        required: ["sourcePath", "destPath"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "append_file",
      description: "Append content to an existing file.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "File path relative to workspace root.",
          },
          content: {
            type: "string",
            description: "Content to append.",
          },
        },
        required: ["filePath", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_dir_recursive",
      description: "List all files in a directory recursively.",
      parameters: {
        type: "object",
        properties: {
          dirPath: {
            type: "string",
            description: "The relative path to list recursively (default is '.').",
          },
        },
      },
    },
  },
];

// Recursive walk implementation for Node.js
async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of list) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".opencode" ||
        entry.name === ".next" ||
        entry.name === "dist" ||
        entry.name === ".gemini"
      ) {
        continue;
      }
      const res = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walk(res)));
      } else {
        files.push(res);
      }
    }
  } catch (e) {
    // ignore dir read errors
  }
  return files;
}

// Simple glob to RegExp converter
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Replace glob wildcards with regex equivalents
  const regexStr = "^" + escaped
    .replace(/\\\*\\\*/g, ".*") // double asterisks -> matches anything including directories
    .replace(/\\\*/g, "[^/]*")   // single asterisk -> matches anything except folder separators
    .replace(/\\\?/g, "[^/]")     // question mark -> matches single character except separator
    + "$";
  return new RegExp(regexStr);
}

// Tool implementations
export async function listDir(dirPath = "."): Promise<string> {
  const target = path.resolve(process.cwd(), dirPath);
  try {
    const entries = await fs.readdir(target, { withFileTypes: true });
    const formatted = entries.map((entry) => {
      const type = entry.isDirectory() ? "[DIR]" : "[FILE]";
      return `${type} ${entry.name}`;
    });
    return formatted.join("\n") || "(empty directory)";
  } catch (e: any) {
    return `Error listing directory: ${e.message}`;
  }
}

export async function findFiles(pattern: string): Promise<string> {
  try {
    const root = process.cwd();
    const allFiles = await walk(root);
    const regex = globToRegex(pattern);
    const matched = allFiles
      .map((f) => path.relative(root, f))
      .filter((f) => regex.test(f));
    return matched.join("\n") || "No files found matching pattern.";
  } catch (e: any) {
    return `Error scanning files: ${e.message}`;
  }
}

export async function viewFile(filePath: string, startLine?: number, endLine?: number): Promise<string> {
  const target = path.resolve(process.cwd(), filePath);
  try {
    const content = await fs.readFile(target, "utf-8");
    const lines = content.split("\n");
    
    if (startLine !== undefined || endLine !== undefined) {
      const start = startLine !== undefined ? Math.max(0, startLine - 1) : 0;
      const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
      const sliced = lines.slice(start, end);
      return sliced.map((line, idx) => `${start + idx + 1}: ${line}`).join("\n");
    }
    
    if (lines.length > 1000) {
      return lines.slice(0, 500).join("\n") + `\n\n... [File truncated. Total lines: ${lines.length}. Use startLine and endLine to read specific parts]`;
    }
    
    return content;
  } catch (e: any) {
    return `Error reading file: ${e.message}`;
  }
}

export async function writeFile(filePath: string, content: string): Promise<string> {
  const target = path.resolve(process.cwd(), filePath);
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf-8");
    return `Successfully wrote file: ${filePath}`;
  } catch (e: any) {
    return `Error writing file: ${e.message}`;
  }
}

export async function patchFile(filePath: string, search: string, replace: string): Promise<string> {
  const target = path.resolve(process.cwd(), filePath);
  try {
    const content = await fs.readFile(target, "utf-8");
    
    const occurrences = content.split(search).length - 1;
    if (occurrences === 0) {
      return `Error: Search content not found in ${filePath}. Make sure you specify the EXACT lines, including whitespaces.`;
    }
    if (occurrences > 1) {
      return `Error: Search content found ${occurrences} times in ${filePath}. Please provide a larger/more unique search block to ensure the correct patch target.`;
    }
    
    const newContent = content.replace(search, replace);
    await fs.writeFile(target, newContent, "utf-8");
    return `Successfully patched file: ${filePath}`;
  } catch (e: any) {
    return `Error patching file: ${e.message}`;
  }
}

export async function runCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execPromise(command, { cwd: process.cwd() });
    return `Command: ${command}\nExit Code: 0\n\nStdout:\n${stdout || "(none)"}\n\nStderr:\n${stderr || "(none)"}`;
  } catch (e: any) {
    return `Command: ${command}\nExit Code: ${e.code ?? 1}\n\nStdout:\n${e.stdout || "(none)"}\n\nStderr:\n${e.stderr || "(none)"}`;
  }
}

export async function webSearch(query: string): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) {
      return `Error: Search failed with status ${response.status}`;
    }
    const html = await response.text();
    const results: { title: string; link: string; snippet: string }[] = [];
    const parts = html.split('<div class="result results_links results_links_deep web-result ');
    
    for (let i = 1; i < parts.length && results.length < 8; i++) {
      const part = parts[i];
      const aLinkMatch = part.match(/<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = part.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      
      if (aLinkMatch) {
        let link = aLinkMatch[1];
        if (link.startsWith("/l/?") || link.startsWith("//duckduckgo.com/l/?")) {
          const uddgMatch = link.match(/[?&]uddg=([^&]+)/);
          if (uddgMatch) {
            link = decodeURIComponent(uddgMatch[1]);
          }
        }
        const title = aLinkMatch[2].replace(/<[^>]+>/g, "").trim();
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        results.push({ title, link, snippet });
      }
    }
    
    if (results.length === 0) {
      return "No results found.";
    }
    
    return results.map((r, idx) => `[${idx + 1}] ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}\n`).join("\n");
  } catch (e: any) {
    return `Error performing search: ${e.message}`;
  }
}

export async function fetchUrl(targetUrl: string): Promise<string> {
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) {
      return `Error: Failed to fetch ${targetUrl} with status ${response.status}`;
    }
    const html = await response.text();
    
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
    text = text.replace(/<[^>]+>/g, " ");
    text = text
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
      
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const cleaned = lines.join("\n");
    if (cleaned.length > 8000) {
      return cleaned.slice(0, 8000) + "\n\n... [Content truncated due to length]";
    }
    return cleaned;
  } catch (e: any) {
    return `Error fetching URL: ${e.message}`;
  }
}

export async function grepSearch(pattern: string, globPattern?: string): Promise<string> {
  try {
    const root = process.cwd();
    const allFiles = await walk(root);
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "i");
    } catch (e: any) {
      return `Error: Invalid RegExp pattern: ${e.message}`;
    }
    
    let globRegex: RegExp | null = null;
    if (globPattern) {
      globRegex = globToRegex(globPattern);
    }
    
    const matchedLines: string[] = [];
    
    for (const f of allFiles) {
      const relPath = path.relative(root, f);
      if (globRegex && !globRegex.test(relPath)) {
        continue;
      }
      
      try {
        const content = await fs.readFile(f, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            matchedLines.push(`${relPath}:${idx + 1}: ${line.trim()}`);
          }
        });
      } catch (err) {
        // ignore
      }
      
      if (matchedLines.length > 200) {
        matchedLines.push("... [Truncated: more than 200 matches found]");
        break;
      }
    }
    
    return matchedLines.join("\n") || "No matches found.";
  } catch (e: any) {
    return `Error during grep: ${e.message}`;
  }
}

export async function createDir(dirPath: string): Promise<string> {
  const target = path.resolve(process.cwd(), dirPath);
  try {
    await fs.mkdir(target, { recursive: true });
    return `Successfully created directory: ${dirPath}`;
  } catch (e: any) {
    return `Error creating directory: ${e.message}`;
  }
}

export async function deleteFile(filePath: string): Promise<string> {
  const target = path.resolve(process.cwd(), filePath);
  try {
    await fs.rm(target, { recursive: true, force: true });
    return `Successfully deleted: ${filePath}`;
  } catch (e: any) {
    return `Error deleting: ${e.message}`;
  }
}

export async function moveFile(sourcePath: string, destPath: string): Promise<string> {
  const source = path.resolve(process.cwd(), sourcePath);
  const dest = path.resolve(process.cwd(), destPath);
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(source, dest);
    return `Successfully moved/renamed ${sourcePath} to ${destPath}`;
  } catch (e: any) {
    return `Error moving file: ${e.message}`;
  }
}

export async function appendFile(filePath: string, content: string): Promise<string> {
  const target = path.resolve(process.cwd(), filePath);
  try {
    await fs.appendFile(target, content, "utf-8");
    return `Successfully appended content to ${filePath}`;
  } catch (e: any) {
    return `Error appending to file: ${e.message}`;
  }
}

export async function listDirRecursive(dirPath = "."): Promise<string> {
  const target = path.resolve(process.cwd(), dirPath);
  try {
    const files = await walk(target);
    const rel = files.map(f => path.relative(target, f));
    return rel.join("\n") || "(empty or no files)";
  } catch (e: any) {
    return `Error listing recursive: ${e.message}`;
  }
}

