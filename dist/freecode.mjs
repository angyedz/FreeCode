// src/config.ts
import fs from "fs/promises";
import path from "path";
import os from "os";
var CONFIG_FILE = path.join(os.homedir(), ".apex-agent.json");
var DEFAULT_CONFIG = {
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  autoApprove: false,
  thinkingLevel: "medium",
  planningMode: false,
  customModels: [],
  theme: "ember",
  mode: "local",
  onboarded: false
};
async function loadConfig() {
  const envBaseURL = process.env.OPENAI_BASE_URL || process.env.APEX_BASE_URL;
  const envApiKey = process.env.OPENAI_API_KEY || process.env.APEX_API_KEY;
  const envModel = process.env.OPENAI_MODEL || process.env.APEX_MODEL;
  const envAutoApprove = process.env.APEX_AUTO_APPROVE === "true";
  let fileConfig = {};
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    fileConfig = JSON.parse(data);
  } catch (e) {
  }
  const config = {
    baseURL: envBaseURL || fileConfig.baseURL || DEFAULT_CONFIG.baseURL,
    apiKey: envApiKey || fileConfig.apiKey || DEFAULT_CONFIG.apiKey,
    model: envModel || fileConfig.model || DEFAULT_CONFIG.model,
    autoApprove: envAutoApprove || fileConfig.autoApprove || DEFAULT_CONFIG.autoApprove,
    thinkingLevel: fileConfig.thinkingLevel || DEFAULT_CONFIG.thinkingLevel,
    planningMode: fileConfig.planningMode !== void 0 ? fileConfig.planningMode : DEFAULT_CONFIG.planningMode,
    customModels: fileConfig.customModels || DEFAULT_CONFIG.customModels,
    theme: fileConfig.theme || DEFAULT_CONFIG.theme,
    mode: fileConfig.mode || DEFAULT_CONFIG.mode,
    onboarded: fileConfig.onboarded !== void 0 ? fileConfig.onboarded : DEFAULT_CONFIG.onboarded,
    account: fileConfig.account
  };
  return config;
}
async function saveConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// src/ui.ts
import readline from "readline";
import os2 from "os";
var COLORS = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  italic: "\x1B[3m",
  red: "\x1B[31m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  blue: "\x1B[34m",
  magenta: "\x1B[35m",
  cyan: "\x1B[36m",
  gray: "\x1B[90m",
  lightGray: "\x1B[37m",
  bgGray: "\x1B[100m",
  orange: "\x1B[38;5;208m",
  dimOrange: "\x1B[38;5;130m"
};
var THEMES = {
  ember: { label: "Ember \xB7 orange", accent: 208, dim: 130 },
  ocean: { label: "Ocean \xB7 cyan", accent: 39, dim: 31 },
  forest: { label: "Forest \xB7 green", accent: 42, dim: 28 },
  grape: { label: "Grape \xB7 purple", accent: 141, dim: 97 },
  crimson: { label: "Crimson \xB7 red", accent: 197, dim: 124 },
  mono: { label: "Mono \xB7 gray", accent: 252, dim: 244 }
};
function applyTheme(name) {
  const t = THEMES[name] || THEMES.ember;
  COLORS.orange = `\x1B[38;5;${t.accent}m`;
  COLORS.dimOrange = `\x1B[38;5;${t.dim}m`;
}
function printBanner(subtitle) {
  const O = COLORS.orange, B = COLORS.bold, R = COLORS.reset, D = COLORS.dim;
  const art = [
    "\u2588\u2580\u2580 \u2588\u2580\u2584 \u2588\u2580\u2580 \u2588\u2580\u2580",
    "\u2588\u2580  \u2588\u2580\u2584 \u2588\u2580  \u2588\u2580 ",
    "\u2580   \u2580 \u2580 \u2580\u2580\u2580 \u2580\u2580\u2580",
    "\u2588\u2580\u2580 \u2588\u2580\u2588 \u2588\u2580\u2584 \u2588\u2580\u2580",
    "\u2588   \u2588 \u2588 \u2588 \u2588 \u2588\u2580 ",
    "\u2580\u2580\u2580 \u2580\u2580\u2580 \u2580\u2580\u2580 \u2580\u2580\u2580"
  ];
  console.log("");
  for (const line of art) console.log(`   ${B}${O}${line}${R}`);
  if (subtitle) console.log(`
   ${D}${subtitle}${R}`);
  console.log("");
}
var spinnerInterval = null;
var spinnerFrames = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
var spinnerFrameIndex = 0;
var spinnerActiveText = "";
function startSpinner(text) {
  if (spinnerInterval) clearInterval(spinnerInterval);
  spinnerActiveText = text;
  process.stderr.write(`\x1B[?25l`);
  spinnerInterval = setInterval(() => {
    const frame = spinnerFrames[spinnerFrameIndex];
    spinnerFrameIndex = (spinnerFrameIndex + 1) % spinnerFrames.length;
    process.stderr.write(`\r${COLORS.orange}${frame}${COLORS.reset} ${spinnerActiveText}\x1B[K`);
  }, 100);
}
function stopSpinner(success = true, statusText) {
  if (!spinnerInterval) return;
  clearInterval(spinnerInterval);
  spinnerInterval = null;
  process.stderr.write(`\r\x1B[?25h\x1B[K`);
  if (statusText) {
    if (success) {
      console.log(`${COLORS.green}[OK]${COLORS.reset} ${statusText}`);
    } else {
      console.log(`${COLORS.red}[ERR]${COLORS.reset} ${statusText}`);
    }
  }
}
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
function askPassword(query) {
  const stdin = process.stdin;
  if (!stdin.isTTY) return askQuestion(query);
  return new Promise((resolve) => {
    let value = "";
    process.stdout.write(query);
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (buf) => {
      const ch = buf.toString("utf8");
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode(false);
        stdin.removeListener("data", onData);
        stdin.pause();
        process.stdout.write("\n");
        resolve(value);
      } else if (ch === "") {
        stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(130);
      } else if (ch === "\x7F" || ch === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (ch >= " ") {
        value += ch;
        process.stdout.write("\u2022");
      }
    };
    stdin.on("data", onData);
  });
}
async function askConfirm(query, defaultYes = true) {
  const chosen = await interactiveMenu(
    query,
    [
      { label: "Yes", value: true },
      { label: "No", value: false }
    ],
    { initialIndex: defaultYes ? 0 : 1 }
  );
  return chosen === null ? defaultYes : chosen;
}
function renderDiff(filePath, search, replace) {
  console.log(`
${COLORS.cyan}--- ${filePath} (original)${COLORS.reset}`);
  console.log(`${COLORS.cyan}+++ ${filePath} (modified)${COLORS.reset}`);
  const searchLines = search.split("\n");
  const replaceLines = replace.split("\n");
  if (searchLines[searchLines.length - 1] === "" && searchLines.length > 1) searchLines.pop();
  if (replaceLines[replaceLines.length - 1] === "" && replaceLines.length > 1) replaceLines.pop();
  for (const line of searchLines) {
    console.log(`${COLORS.red}- ${line}${COLORS.reset}`);
  }
  for (const line of replaceLines) {
    console.log(`${COLORS.green}+ ${line}${COLORS.reset}`);
  }
  console.log();
}
function renderMarkdown(text) {
  let output = text;
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  output = output.replace(codeBlockRegex, (match, lang, code) => {
    const border = `${COLORS.gray}\u2502${COLORS.reset} `;
    const indentedCode = code.split("\n").map((line) => `${border}${COLORS.lightGray}${line}${COLORS.reset}`).join("\n");
    const header = `${COLORS.gray}\u250C\u2500\u2500\u2500${COLORS.reset} ${COLORS.bold}${COLORS.cyan}${lang || "code"}${COLORS.reset} ${COLORS.gray}\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}
`;
    const footer = `
${COLORS.gray}\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}`;
    return `
${header}${indentedCode}${footer}
`;
  });
  output = output.replace(/`([^`\n]+)`/g, `${COLORS.magenta}$1${COLORS.reset}`);
  output = output.replace(/\*\*([^*]+)\*\*/g, `${COLORS.bold}$1${COLORS.reset}`);
  output = output.replace(/\*([^*]+)\*/g, `${COLORS.italic}$1${COLORS.reset}`);
  output = output.replace(/^### (.*)$/gm, `
${COLORS.bold}${COLORS.cyan}### $1${COLORS.reset}`);
  output = output.replace(/^## (.*)$/gm, `
${COLORS.bold}${COLORS.cyan}## $1${COLORS.reset}`);
  output = output.replace(/^# (.*)$/gm, `
${COLORS.bold}${COLORS.cyan}# $1${COLORS.reset}`);
  output = output.replace(/^[-\*] (.*)$/gm, `  ${COLORS.cyan}*${COLORS.reset} $1`);
  return output;
}
function visibleLen(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}
function padCell(s, width) {
  const len = visibleLen(s);
  if (len > width) {
    const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
    return plain.slice(0, Math.max(0, width - 1)) + "\u2026";
  }
  return s + " ".repeat(width - len);
}
function printLogo(modelName, baseURL) {
  const { orange: O, reset: R, gray: D, bold: B, dimOrange: DO } = COLORS;
  let user = "developer";
  try {
    user = os2.userInfo().username || user;
  } catch {
  }
  const home = os2.homedir();
  let cwd = process.cwd();
  if (home && cwd.startsWith(home)) cwd = "~" + cwd.slice(home.length);
  const endpoint = baseURL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const LW = 28, RW = 40, GAP = 3;
  const width = LW + RW + GAP + 2;
  const left = [
    `${B}${O}FreeCode${R} ${D}v1.0.0${R}`,
    "",
    `${B}Welcome back ${O}${user}${R}${B}!${R}`,
    "",
    `${O}\u2588\u2580\u2580 \u2588\u2580\u2584 \u2588\u2580\u2580 \u2588\u2580\u2580${R}`,
    `${O}\u2588\u2580  \u2588\u2580\u2584 \u2588\u2580  \u2588\u2580 ${R}`,
    `${O}\u2580   \u2580 \u2580 \u2580\u2580\u2580 \u2580\u2580\u2580${R}`,
    `${O}\u2588\u2580\u2580 \u2588\u2580\u2588 \u2588\u2580\u2584 \u2588\u2580\u2580${R}`,
    `${O}\u2588   \u2588 \u2588 \u2588 \u2588 \u2588\u2580 ${R}`,
    `${O}\u2580\u2580\u2580 \u2580\u2580\u2580 \u2580\u2580\u2580 \u2580\u2580\u2580${R}`,
    "",
    `${D}${modelName} \xB7 Max 20x${R}`,
    `${D}${endpoint}${R}`,
    `${D}${cwd}${R}`
  ];
  const right = [
    `${B}${O}Getting started${R}`,
    `${D}now${R}    Ask me to build or fix code`,
    `${D}tip${R}    I can run commands & edit files`,
    `${D}tip${R}    Approve tool calls with y / n`,
    `${D}...${R}    /help for more`,
    "",
    `${B}${O}What's new${R}`,
    `${DO}/model${R}   switch the active model`,
    `${DO}/think${R}   set reasoning depth`,
    `${DO}/plan${R}    toggle planning mode`,
    `${D}...${R}      /help for more`
  ];
  const rows = Math.max(left.length, right.length);
  const out2 = [];
  out2.push(`${O}\u256D${"\u2504".repeat(width)}\u256E${R}`);
  for (let i = 0; i < rows; i++) {
    const l = padCell(left[i] ?? "", LW);
    const r = padCell(right[i] ?? "", RW);
    out2.push(`${O}\u250A${R} ${l}${" ".repeat(GAP)}${r} ${O}\u250A${R}`);
  }
  out2.push(`${O}\u2570${"\u2504".repeat(width)}\u256F${R}`);
  console.log("\n" + out2.join("\n") + "\n");
}
function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
function out(s) {
  process.stdout.write(s);
}
async function numberedFallback(title, options) {
  if (options.length === 0) return null;
  console.log(`${COLORS.bold}${COLORS.cyan}? ${title}${COLORS.reset}`);
  options.forEach((opt, idx) => console.log(`  ${idx + 1}) ${opt.label}`));
  while (true) {
    const answer = await askQuestion(`Select (1-${options.length}): `);
    const n = parseInt(answer.trim(), 10);
    if (!isNaN(n) && n >= 1 && n <= options.length) return options[n - 1].value;
    console.log(`${COLORS.red}Invalid option.${COLORS.reset}`);
  }
}
function interactiveMenu(title, options, opts = {}) {
  if (!isInteractive() || options.length === 0) return numberedFallback(title, options);
  const stdin = process.stdin;
  return new Promise((resolve) => {
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    let filter = "";
    let index = Math.max(0, Math.min(opts.initialIndex ?? 0, options.length - 1));
    let prev = 0;
    let offsetRow = 0;
    const visible = () => opts.filterable && filter ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase())) : options;
    const layout = (items) => {
      const termW = process.stdout.columns || 80;
      const maxLabel = items.reduce((m, o) => Math.max(m, o.label.length), 0);
      const colW = Math.min(34, Math.max(14, maxLabel + 4));
      let cols = opts.columns ?? Math.max(1, Math.floor(termW / colW));
      cols = Math.max(1, Math.min(cols, 6, items.length || 1));
      const rows = Math.max(1, opts.pageSize ?? 10);
      return { cols, rows, colW };
    };
    const draw = () => {
      const items = visible();
      if (index >= items.length) index = Math.max(0, items.length - 1);
      if (index < 0) index = 0;
      const { cols, rows, colW } = layout(items);
      const showHints = cols === 1;
      const totalRows = Math.max(1, Math.ceil((items.length || 1) / cols));
      const activeRow = Math.floor(index / cols);
      if (activeRow < offsetRow) offsetRow = activeRow;
      if (activeRow >= offsetRow + rows) offsetRow = activeRow - rows + 1;
      offsetRow = Math.max(0, Math.min(offsetRow, Math.max(0, totalRows - rows)));
      const lines = [];
      lines.push(`${COLORS.orange}?${COLORS.reset} ${COLORS.bold}${title}${COLORS.reset}`);
      if (opts.filterable) {
        const f = filter ? filter : `${COLORS.gray}(type to search)${COLORS.reset}`;
        lines.push(`  ${COLORS.gray}search:${COLORS.reset} ${f}`);
      }
      if (items.length === 0) {
        lines.push(`   ${COLORS.gray}no matches${COLORS.reset}`);
      } else {
        for (let r = offsetRow; r < Math.min(offsetRow + rows, totalRows); r++) {
          let line = "";
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            if (idx >= items.length) break;
            const o = items[idx];
            const active = idx === index;
            const ptr = active ? `${COLORS.orange}\u276F${COLORS.reset}` : " ";
            const lbl = active ? `${COLORS.orange}${o.label}${COLORS.reset}` : o.label;
            const hint = showHints && o.hint ? `  ${COLORS.gray}${o.hint}${COLORS.reset}` : "";
            const cell = ` ${ptr} ${lbl}${hint}`;
            line += cols > 1 ? padCell(cell, colW) : cell;
          }
          lines.push(line);
        }
      }
      const pos = items.length ? `${index + 1}/${items.length}` : "0/0";
      const nav = cols > 1 ? `\u2190/\u2192/\u2191/\u2193 move` : `\u2191/\u2193 move`;
      const scroll = totalRows > rows ? ` \xB7 PgUp/PgDn` : "";
      lines.push(`${COLORS.gray}${pos} \xB7 ${nav}${scroll} \xB7 \u21B5 select \xB7 esc cancel${COLORS.reset}`);
      if (prev > 0) out(`\x1B[${prev}A`);
      out(lines.map((l) => `\x1B[2K${l}`).join("\n") + "\n\x1B[J");
      prev = lines.length;
    };
    const cleanup = () => {
      stdin.removeListener("keypress", onKey);
      if (stdin.isTTY) stdin.setRawMode(false);
      out("\x1B[?25h");
    };
    const onKey = (str, key) => {
      const items = visible();
      const len = items.length;
      const { cols, rows } = layout(items);
      const page = cols * rows;
      const clamp = () => {
        if (index < 0) index = 0;
        if (index > len - 1) index = Math.max(0, len - 1);
        draw();
      };
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        out("\n");
        process.exit(130);
      } else if (key && key.name === "left") {
        if (len) index = (index - 1 + len) % len;
        draw();
      } else if (key && (key.name === "right" || key.name === "tab" && !key.shift)) {
        if (len) index = (index + 1) % len;
        draw();
      } else if (key && (key.name === "up" || key.shift && key.name === "tab")) {
        index -= cols;
        clamp();
      } else if (key && key.name === "down") {
        index += cols;
        clamp();
      } else if (key && key.name === "pageup") {
        index -= page;
        clamp();
      } else if (key && key.name === "pagedown") {
        index += page;
        clamp();
      } else if (key && key.name === "home") {
        index = 0;
        draw();
      } else if (key && key.name === "end") {
        index = Math.max(0, len - 1);
        draw();
      } else if (key && (key.name === "return" || key.name === "enter")) {
        const chosen = items[index];
        cleanup();
        if (prev > 0) out(`\x1B[${prev}A\x1B[J`);
        if (chosen) {
          out(`${COLORS.orange}\u2713${COLORS.reset} ${title} ${COLORS.gray}\u203A${COLORS.reset} ${COLORS.orange}${chosen.label}${COLORS.reset}
`);
          resolve(chosen.value);
        } else resolve(null);
      } else if (key && key.name === "escape") {
        cleanup();
        if (prev > 0) out(`\x1B[${prev}A\x1B[J`);
        out(`${COLORS.gray}\u2717 ${title} (cancelled)${COLORS.reset}
`);
        resolve(null);
      } else if (opts.filterable && key && key.name === "backspace") {
        filter = filter.slice(0, -1);
        index = 0;
        draw();
      } else if (opts.filterable && key && str && str.length === 1 && str >= " " && !key.ctrl) {
        filter += str;
        index = 0;
        draw();
      }
    };
    out("\x1B[?25l");
    stdin.on("keypress", onKey);
    draw();
  });
}

// src/tools.ts
import fs2 from "fs/promises";
import path2 from "path";
import { exec } from "child_process";
import { promisify } from "util";
var execPromise = promisify(exec);
var toolDefinitions = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List contents of a directory (non-recursively) to see files and folders.",
      parameters: {
        type: "object",
        properties: {
          dirPath: {
            type: "string",
            description: "Directory path relative to workspace root (use '.' for root)."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_files",
      description: "Find files matching a glob pattern (e.g. 'src/**/*.ts' or '*.json') inside the workspace.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern to search for."
          }
        },
        required: ["pattern"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "view_file",
      description: "Read the contents of a text file. You can optionally specify a line range.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "File path relative to workspace root."
          },
          startLine: {
            type: "number",
            description: "Start line number (1-indexed, inclusive)."
          },
          endLine: {
            type: "number",
            description: "End line number (1-indexed, inclusive)."
          }
        },
        required: ["filePath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create a new file or completely overwrite an existing file with new content.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "File path relative to workspace root."
          },
          content: {
            type: "string",
            description: "The complete content to write into the file."
          }
        },
        required: ["filePath", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "patch_file",
      description: "Edit an existing file by replacing a unique matching block of code. This is much faster and cheaper than writing the entire file.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "File path relative to workspace root."
          },
          search: {
            type: "string",
            description: "The exact block of code to search for. Must be a unique block in the file."
          },
          replace: {
            type: "string",
            description: "The block of code to replace the search block with."
          }
        },
        required: ["filePath", "search", "replace"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command on the host machine in the workspace directory. Use this to install dependencies, run tests, build the project, or run other shell operations.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute."
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information using DuckDuckGo search engine.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query term."
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch the text content of a web page/URL, stripping HTML tags.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The web page URL to fetch."
          }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "grep_search",
      description: "Find occurrences of a regular expression pattern in the workspace files.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "The RegExp pattern to match in files."
          },
          globPattern: {
            type: "string",
            description: "Optional glob pattern to restrict search files (e.g. '*.ts')."
          }
        },
        required: ["pattern"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_dir",
      description: "Create a new directory recursively.",
      parameters: {
        type: "object",
        properties: {
          dirPath: {
            type: "string",
            description: "The directory path to create."
          }
        },
        required: ["dirPath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file or directory recursively from the workspace.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "The file path to delete."
          }
        },
        required: ["filePath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description: "Move or rename a file or directory.",
      parameters: {
        type: "object",
        properties: {
          sourcePath: {
            type: "string",
            description: "The source path."
          },
          destPath: {
            type: "string",
            description: "The destination path."
          }
        },
        required: ["sourcePath", "destPath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "append_file",
      description: "Append content to an existing file.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "File path relative to workspace root."
          },
          content: {
            type: "string",
            description: "Content to append."
          }
        },
        required: ["filePath", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_dir_recursive",
      description: "List all files in a directory recursively.",
      parameters: {
        type: "object",
        properties: {
          dirPath: {
            type: "string",
            description: "The relative path to list recursively (default is '.')."
          }
        }
      }
    }
  }
];
async function walk(dir) {
  const files = [];
  try {
    const list = await fs2.readdir(dir, { withFileTypes: true });
    for (const entry of list) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".opencode" || entry.name === ".next" || entry.name === "dist" || entry.name === ".gemini") {
        continue;
      }
      const res = path2.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await walk(res));
      } else {
        files.push(res);
      }
    }
  } catch (e) {
  }
  return files;
}
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped.replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*").replace(/\\\?/g, "[^/]") + "$";
  return new RegExp(regexStr);
}
async function listDir(dirPath = ".") {
  const target = path2.resolve(process.cwd(), dirPath);
  try {
    const entries = await fs2.readdir(target, { withFileTypes: true });
    const formatted = entries.map((entry) => {
      const type = entry.isDirectory() ? "[DIR]" : "[FILE]";
      return `${type} ${entry.name}`;
    });
    return formatted.join("\n") || "(empty directory)";
  } catch (e) {
    return `Error listing directory: ${e.message}`;
  }
}
async function findFiles(pattern) {
  try {
    const root = process.cwd();
    const allFiles = await walk(root);
    const regex = globToRegex(pattern);
    const matched = allFiles.map((f) => path2.relative(root, f)).filter((f) => regex.test(f));
    return matched.join("\n") || "No files found matching pattern.";
  } catch (e) {
    return `Error scanning files: ${e.message}`;
  }
}
async function viewFile(filePath, startLine, endLine) {
  const target = path2.resolve(process.cwd(), filePath);
  try {
    const content = await fs2.readFile(target, "utf-8");
    const lines = content.split("\n");
    if (startLine !== void 0 || endLine !== void 0) {
      const start = startLine !== void 0 ? Math.max(0, startLine - 1) : 0;
      const end = endLine !== void 0 ? Math.min(lines.length, endLine) : lines.length;
      const sliced = lines.slice(start, end);
      return sliced.map((line, idx) => `${start + idx + 1}: ${line}`).join("\n");
    }
    if (lines.length > 1e3) {
      return lines.slice(0, 500).join("\n") + `

... [File truncated. Total lines: ${lines.length}. Use startLine and endLine to read specific parts]`;
    }
    return content;
  } catch (e) {
    return `Error reading file: ${e.message}`;
  }
}
async function writeFile(filePath, content) {
  const target = path2.resolve(process.cwd(), filePath);
  try {
    await fs2.mkdir(path2.dirname(target), { recursive: true });
    await fs2.writeFile(target, content, "utf-8");
    return `Successfully wrote file: ${filePath}`;
  } catch (e) {
    return `Error writing file: ${e.message}`;
  }
}
async function patchFile(filePath, search, replace) {
  const target = path2.resolve(process.cwd(), filePath);
  try {
    const content = await fs2.readFile(target, "utf-8");
    const occurrences = content.split(search).length - 1;
    if (occurrences === 0) {
      return `Error: Search content not found in ${filePath}. Make sure you specify the EXACT lines, including whitespaces.`;
    }
    if (occurrences > 1) {
      return `Error: Search content found ${occurrences} times in ${filePath}. Please provide a larger/more unique search block to ensure the correct patch target.`;
    }
    const newContent = content.replace(search, replace);
    await fs2.writeFile(target, newContent, "utf-8");
    return `Successfully patched file: ${filePath}`;
  } catch (e) {
    return `Error patching file: ${e.message}`;
  }
}
async function runCommand(command) {
  try {
    const { stdout, stderr } = await execPromise(command, { cwd: process.cwd() });
    return `Command: ${command}
Exit Code: 0

Stdout:
${stdout || "(none)"}

Stderr:
${stderr || "(none)"}`;
  } catch (e) {
    return `Command: ${command}
Exit Code: ${e.code ?? 1}

Stdout:
${e.stdout || "(none)"}

Stderr:
${e.stderr || "(none)"}`;
  }
}
async function webSearch(query) {
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
    const results = [];
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
    return results.map((r, idx) => `[${idx + 1}] ${r.title}
URL: ${r.link}
Snippet: ${r.snippet}
`).join("\n");
  } catch (e) {
    return `Error performing search: ${e.message}`;
  }
}
async function fetchUrl(targetUrl) {
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
    text = text.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const cleaned = lines.join("\n");
    if (cleaned.length > 8e3) {
      return cleaned.slice(0, 8e3) + "\n\n... [Content truncated due to length]";
    }
    return cleaned;
  } catch (e) {
    return `Error fetching URL: ${e.message}`;
  }
}
async function grepSearch(pattern, globPattern) {
  try {
    const root = process.cwd();
    const allFiles = await walk(root);
    let regex;
    try {
      regex = new RegExp(pattern, "i");
    } catch (e) {
      return `Error: Invalid RegExp pattern: ${e.message}`;
    }
    let globRegex = null;
    if (globPattern) {
      globRegex = globToRegex(globPattern);
    }
    const matchedLines = [];
    for (const f of allFiles) {
      const relPath = path2.relative(root, f);
      if (globRegex && !globRegex.test(relPath)) {
        continue;
      }
      try {
        const content = await fs2.readFile(f, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            matchedLines.push(`${relPath}:${idx + 1}: ${line.trim()}`);
          }
        });
      } catch (err) {
      }
      if (matchedLines.length > 200) {
        matchedLines.push("... [Truncated: more than 200 matches found]");
        break;
      }
    }
    return matchedLines.join("\n") || "No matches found.";
  } catch (e) {
    return `Error during grep: ${e.message}`;
  }
}
async function createDir(dirPath) {
  const target = path2.resolve(process.cwd(), dirPath);
  try {
    await fs2.mkdir(target, { recursive: true });
    return `Successfully created directory: ${dirPath}`;
  } catch (e) {
    return `Error creating directory: ${e.message}`;
  }
}
async function deleteFile(filePath) {
  const target = path2.resolve(process.cwd(), filePath);
  try {
    await fs2.rm(target, { recursive: true, force: true });
    return `Successfully deleted: ${filePath}`;
  } catch (e) {
    return `Error deleting: ${e.message}`;
  }
}
async function moveFile(sourcePath, destPath) {
  const source = path2.resolve(process.cwd(), sourcePath);
  const dest = path2.resolve(process.cwd(), destPath);
  try {
    await fs2.mkdir(path2.dirname(dest), { recursive: true });
    await fs2.rename(source, dest);
    return `Successfully moved/renamed ${sourcePath} to ${destPath}`;
  } catch (e) {
    return `Error moving file: ${e.message}`;
  }
}
async function appendFile(filePath, content) {
  const target = path2.resolve(process.cwd(), filePath);
  try {
    await fs2.appendFile(target, content, "utf-8");
    return `Successfully appended content to ${filePath}`;
  } catch (e) {
    return `Error appending to file: ${e.message}`;
  }
}
async function listDirRecursive(dirPath = ".") {
  const target = path2.resolve(process.cwd(), dirPath);
  try {
    const files = await walk(target);
    const rel = files.map((f) => path2.relative(target, f));
    return rel.join("\n") || "(empty or no files)";
  } catch (e) {
    return `Error listing recursive: ${e.message}`;
  }
}

// src/agent.ts
var SYSTEM_PROMPT = `You are FreeCode, a direct, action-oriented AI coding assistant.
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
async function runAgentLoop(messages, config) {
  if (messages.length === 0 || messages[0].role !== "system") {
    messages.unshift({ role: "system", content: SYSTEM_PROMPT });
  }
  let loopCount = 0;
  while (true) {
    loopCount++;
    const url = `${config.baseURL.replace(/\/$/, "")}/chat/completions`;
    const headers = {
      "Content-Type": "application/json"
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
    startSpinner("Preparing request...");
    const requestBody = {
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...m.tool_calls && { tool_calls: m.tool_calls },
        ...m.tool_call_id && { tool_call_id: m.tool_call_id },
        ...m.name && { name: m.name }
      })),
      tools: toolDefinitions,
      stream: true
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
        body: JSON.stringify(requestBody)
      });
    } catch (e) {
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
    const toolCalls = {};
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
            const reasoning = delta.reasoning_content || delta.thinking || delta.thought;
            if (reasoning) {
              if (!hasShownReasoningHeader) {
                console.log(`
${COLORS.gray}\u250C\u2500\u2500\u2500 Thinking Process \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}`);
                hasShownReasoningHeader = true;
              }
              process.stdout.write(`${COLORS.gray}${reasoning}${COLORS.reset}`);
              reasoningText += reasoning;
            }
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
                          console.log(`
${COLORS.gray}\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}`);
                          hasClosedReasoning = true;
                        }
                        if (!hasShownResponseHeader) {
                          console.log(`
${COLORS.bold}${COLORS.cyan}> Response:${COLORS.reset}`);
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
                        console.log(`
${COLORS.gray}\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}`);
                        hasClosedReasoning = true;
                      }
                      if (!hasShownResponseHeader) {
                        console.log(`
${COLORS.bold}${COLORS.cyan}> Response:${COLORS.reset}`);
                        hasShownResponseHeader = true;
                      }
                      process.stdout.write(normalChunk);
                      assistantText += normalChunk;
                      hasStreamedResponseText = true;
                    }
                    if (!hasShownReasoningHeader) {
                      console.log(`
${COLORS.gray}\u250C\u2500\u2500\u2500 Thinking Process \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}`);
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
                      console.log(`
${COLORS.gray}\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}`);
                      hasClosedReasoning = true;
                    }
                    inThinkingTag = false;
                    parseIndex = closeIndex + "</thinking>".length;
                  }
                }
              }
            }
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
                        console.log(`
${COLORS.gray}\u250C\u2500\u2500\u2500 Streaming Code Changes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}`);
                      }
                      process.stdout.write(`${COLORS.green}${newChunk}${COLORS.reset}`);
                      lastPrintedFieldLength = extracted.length;
                    }
                  }
                }
              }
            }
          } catch (err) {
          }
        }
      }
    }
    if (inThinkingTag) {
      inThinkingTag = false;
    }
    if (hasShownReasoningHeader && !hasClosedReasoning) {
      console.log(`
${COLORS.gray}\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}`);
      hasClosedReasoning = true;
    }
    if (lastPrintedFieldLength > 0) {
      console.log(`
${COLORS.gray}\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}`);
    }
    if (!assistantText.trim() && reasoningText.trim()) {
      assistantText = reasoningText;
      if (!hasShownResponseHeader) {
        console.log(`
${COLORS.bold}${COLORS.cyan}> Response:${COLORS.reset}`);
        hasShownResponseHeader = true;
      }
    }
    if (hasShownResponseHeader && assistantText) {
      if (hasStreamedResponseText) {
        const columns = process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 80;
        const linesToClear = countLines(assistantText, columns);
        if (linesToClear > 0) {
          process.stdout.write("\r\x1B[2K");
          for (let i = 1; i < linesToClear; i++) {
            process.stdout.write("\x1B[1A\x1B[2K");
          }
          process.stdout.write("\r");
        }
      }
      const rendered = renderMarkdown(assistantText);
      console.log(rendered);
    } else {
      console.log();
    }
    const toolCallList = Object.values(toolCalls).map((tc) => ({
      id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
      type: "function",
      function: {
        name: tc.name || "",
        arguments: tc.arguments
      }
    }));
    messages.push({
      role: "assistant",
      content: assistantText || null,
      tool_calls: toolCallList.length > 0 ? toolCallList : void 0
    });
    if (toolCallList.length === 0) {
      break;
    }
    for (const toolCall of toolCallList) {
      const toolName = toolCall.function.name;
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (err) {
        console.log(`${COLORS.red}Error parsing arguments for tool ${toolName}: ${toolCall.function.arguments}${COLORS.reset}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolName,
          content: `Error parsing arguments: ${err}`
        });
        continue;
      }
      console.log(`
${COLORS.bold}${COLORS.yellow}[Tool Execution Request]${COLORS.reset}`);
      let detailLine = "";
      if (toolName === "run_command") {
        detailLine = `Command: ${COLORS.bold}${COLORS.cyan}${args.command}${COLORS.reset}`;
      } else if (toolName === "list_dir") {
        detailLine = `Listing: ${COLORS.cyan}${args.dirPath || "."}${COLORS.reset}`;
      } else if (toolName === "find_files") {
        detailLine = `Pattern: ${COLORS.cyan}${args.pattern}${COLORS.reset}`;
      } else if (toolName === "view_file") {
        detailLine = `Reading: ${COLORS.cyan}${args.filePath}${COLORS.reset}${args.startLine ? ` (lines ${args.startLine}-${args.endLine || "end"})` : ""}`;
      } else if (toolName === "write_file") {
        detailLine = `Writing: ${COLORS.cyan}${args.filePath}${COLORS.reset} (${args.content.length} chars)`;
      } else if (toolName === "patch_file") {
        detailLine = `Patching: ${COLORS.cyan}${args.filePath}${COLORS.reset}`;
      } else if (toolName === "web_search") {
        detailLine = `Searching: ${COLORS.cyan}${args.query}${COLORS.reset}`;
      } else if (toolName === "fetch_url") {
        detailLine = `Fetching: ${COLORS.cyan}${args.url}${COLORS.reset}`;
      } else if (toolName === "grep_search") {
        detailLine = `Grep: ${COLORS.cyan}${args.pattern}${COLORS.reset}${args.globPattern ? ` in ${args.globPattern}` : ""}`;
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
      const rightBorder = "\u2500".repeat(borderLength - headerTitle.length - 4);
      console.log(`
${COLORS.gray}\u250C\u2500\u2500\u2500${COLORS.reset}${COLORS.bold}${COLORS.yellow}${headerTitle}${COLORS.reset}${COLORS.gray}${rightBorder}${COLORS.reset}`);
      console.log(`${COLORS.gray}\u2502${COLORS.reset} ${detailLine}`);
      console.log(`${COLORS.gray}\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${COLORS.reset}`);
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
          content: "Error: Tool execution denied by user."
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
      } catch (err) {
        stopSpinner(false, `Failed ${toolName}`);
        result = `Error executing tool: ${err.message}`;
      }
      const lines = result.split("\n");
      const preview = lines.slice(0, 15).join("\n") + (lines.length > 15 ? `
... [Results truncated. Total lines: ${lines.length}]` : "");
      console.log(`${COLORS.gray}Results Preview:
${preview}${COLORS.reset}
`);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: result
      });
    }
  }
}
function countLines(text, columns) {
  const lines = text.split("\n");
  let total = 0;
  for (const line of lines) {
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, "");
    total += Math.max(1, Math.ceil(cleanLine.length / columns));
  }
  return total;
}
function extractStreamingField(argumentsStr, fieldName) {
  const regex = new RegExp(`"${fieldName}"\\s*:\\s*"`);
  const match = argumentsStr.match(regex);
  if (!match) return "";
  const startIndex = match.index + match[0].length;
  let result = "";
  let escaped = false;
  for (let i = startIndex; i < argumentsStr.length; i++) {
    const char = argumentsStr[i];
    if (escaped) {
      if (char === "n") result += "\n";
      else if (char === "t") result += "	";
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

// src/models.ts
async function fetchModels(config) {
  const url = `${config.baseURL.replace(/\/$/, "")}/models`;
  const headers = {};
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    const data = await response.json();
    if (data && Array.isArray(data.data)) {
      return data.data.map((m) => m.id);
    }
  } catch (e) {
    throw new Error(`Failed to fetch models: ${e.message}`);
  }
  return [];
}

// src/account.ts
var DEFAULT_SERVER = "https://freecode-accounts.luchue117.workers.dev";
var SYNC_KEYS = [
  "baseURL",
  "apiKey",
  "model",
  "autoApprove",
  "thinkingLevel",
  "planningMode",
  "customModels",
  "theme"
];
function syncableData(config) {
  const out2 = {};
  for (const k of SYNC_KEYS) out2[k] = config[k];
  return out2;
}
function applySyncedData(config, data) {
  for (const k of SYNC_KEYS) {
    if (data[k] !== void 0) config[k] = data[k];
  }
}
function serverURL(config) {
  return config.account?.serverURL || DEFAULT_SERVER;
}
async function api(base, path3, method, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${path3}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : void 0
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
  }
  return { ok: res.ok, status: res.status, json };
}
async function registerAccount(server, username, password) {
  const r = await api(server, "/register", "POST", { username, password });
  if (!r.ok) throw new Error(r.json?.error || `Register failed (${r.status})`);
  return true;
}
async function loginAccount(server, username, password) {
  const r = await api(server, "/login", "POST", { username, password });
  if (!r.ok) throw new Error(r.json?.error || `Login failed (${r.status})`);
  return { token: r.json.token, data: r.json.data || {} };
}
async function logoutAccount(config) {
  if (!config.account?.token) return;
  await api(serverURL(config), "/logout", "POST", void 0, config.account.token).catch(() => {
  });
}
async function pushAccount(config) {
  if (!config.account?.token) throw new Error("Not logged in");
  const r = await api(serverURL(config), "/account", "PUT", { data: syncableData(config) }, config.account.token);
  if (!r.ok) throw new Error(r.json?.error || `Sync failed (${r.status})`);
  return true;
}
async function pullAccount(config) {
  if (!config.account?.token) throw new Error("Not logged in");
  const r = await api(serverURL(config), "/account", "GET", void 0, config.account.token);
  if (!r.ok) throw new Error(r.json?.error || `Fetch failed (${r.status})`);
  return r.json.data || {};
}

// src/onboarding.ts
async function runOnboarding(config) {
  console.clear();
  printBanner("Welcome \u2014 let's set up FreeCode");
  const themeOpts = Object.entries(THEMES).map(
    ([k, t]) => ({ label: t.label, value: k })
  );
  const curTheme = themeOpts.findIndex((o) => o.value === config.theme);
  const theme = await interactiveMenu("Choose a color theme", themeOpts, {
    initialIndex: curTheme >= 0 ? curTheme : 0
  });
  if (theme) {
    config.theme = theme;
    applyTheme(theme);
  }
  console.clear();
  printBanner("Theme applied \u2014 looking good");
  const mode = await interactiveMenu(
    "How do you want to use FreeCode?",
    [
      { label: "Local only", value: "local", hint: "settings stored on this machine" },
      { label: "With an account", value: "cloud", hint: "sync settings across devices" }
    ],
    { initialIndex: config.mode === "cloud" ? 1 : 0 }
  );
  config.mode = mode || "local";
  if (config.mode === "cloud") config = await loginFlow(config);
  config = await setupApi(config);
  config.autoApprove = await askConfirm("Auto-approve tool actions?", config.autoApprove);
  config.onboarded = true;
  await saveConfig(config);
  if (config.mode === "cloud" && config.account?.token) {
    try {
      await pushAccount(config);
    } catch {
    }
  }
  console.log(`
${COLORS.green}\u2713 Setup complete. Launching FreeCode\u2026${COLORS.reset}
`);
  return config;
}
async function loginFlow(config) {
  const server = config.account?.serverURL || DEFAULT_SERVER;
  while (true) {
    const action = await interactiveMenu("Account", [
      { label: "Log in", value: "login", hint: "existing account" },
      { label: "Register", value: "register", hint: "create a new account" },
      { label: "Skip for now", value: "skip", hint: "stay local" }
    ], {});
    if (!action || action === "skip") {
      config.mode = "local";
      return config;
    }
    const username = (await askQuestion(`${COLORS.orange}Username${COLORS.reset}: `)).trim();
    const password = (await askPassword(`${COLORS.orange}Password${COLORS.reset}: `)).trim();
    if (!username || !password) {
      console.log(`${COLORS.red}Username and password are required.${COLORS.reset}`);
      continue;
    }
    try {
      if (action === "register") {
        await registerAccount(server, username, password);
        console.log(`${COLORS.green}Account created.${COLORS.reset}`);
      }
      const { token, data } = await loginAccount(server, username, password);
      config.account = { serverURL: server, username, token };
      config.mode = "cloud";
      if (data && Object.keys(data).length) applySyncedData(config, data);
      console.log(`${COLORS.green}\u2713 Logged in as ${username}.${COLORS.reset}`);
      return config;
    } catch (e) {
      console.log(`${COLORS.red}${e?.message || e}${COLORS.reset}`);
      const retry = await askConfirm("Try again?", true);
      if (!retry) {
        config.mode = "local";
        return config;
      }
    }
  }
}
async function setupApi(config) {
  console.log(`
${COLORS.bold}${COLORS.orange}API connection${COLORS.reset}`);
  const baseURL = await askQuestion(`API base URL ${COLORS.gray}(${config.baseURL})${COLORS.reset}: `);
  if (baseURL.trim()) config.baseURL = baseURL.trim();
  const apiKey = await askPassword(`API key ${COLORS.gray}(${config.apiKey ? "keep current" : "required"})${COLORS.reset}: `);
  if (apiKey.trim()) config.apiKey = apiKey.trim();
  return config;
}

// src/index.ts
var COMMANDS = [
  { name: "/help", desc: "Show help and commands" },
  { name: "/model", desc: "Switch the active model" },
  { name: "/think", desc: "Set reasoning depth" },
  { name: "/plan", desc: "Toggle planning mode" },
  { name: "/theme", desc: "Change the color theme" },
  { name: "/login", desc: "Log in / register an account" },
  { name: "/sync", desc: "Sync settings with your account" },
  { name: "/logout", desc: "Log out of your account" },
  { name: "/config", desc: "Open the setup wizard" },
  { name: "/clear", desc: "Clear the screen" },
  { name: "/exit", desc: "Quit FreeCode" }
];
async function resolveCommand(input) {
  const trimmed = input.trim();
  const [head, ...rest] = trimmed.split(/\s+/);
  const args = rest.join(" ");
  const exact = COMMANDS.find((c) => c.name === head);
  if (exact) return args ? `${exact.name} ${args}` : exact.name;
  const matches = COMMANDS.filter((c) => c.name.startsWith(head));
  if (matches.length === 1) return args ? `${matches[0].name} ${args}` : matches[0].name;
  const pool = matches.length > 0 ? matches : COMMANDS;
  const options = pool.map((c) => ({
    label: c.name,
    value: c.name,
    hint: c.desc
  }));
  const picked = await interactiveMenu("Commands", options, { filterable: true });
  if (!picked) return null;
  return args ? `${picked} ${args}` : picked;
}
async function handleModelCommand(parts, config) {
  const sub = parts[1];
  if (sub === "add") {
    const name = await askQuestion("Model display name: ");
    const id = await askQuestion("Model id: ");
    if (name.trim() && id.trim()) {
      config.customModels = [...config.customModels || [], { name: name.trim(), id: id.trim() }];
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
  let apiModels = [];
  try {
    apiModels = await fetchModels(config);
  } catch {
  }
  const custom = (config.customModels || []).map((m) => ({
    label: m.name,
    value: m.id,
    hint: m.id
  }));
  const options = [
    ...apiModels.map((m) => ({ label: m, value: m, hint: "api" })),
    ...custom
  ];
  if (options.length === 0) {
    console.log(`${COLORS.gray}No models available. Use "/model add".${COLORS.reset}`);
    return config;
  }
  const current = options.findIndex((o) => o.value === config.model);
  const picked = await interactiveMenu("Select active model", options, {
    filterable: true,
    initialIndex: current >= 0 ? current : 0
  });
  if (picked) {
    config.model = picked;
    saveConfig(config);
    console.log(`${COLORS.green}Model set to ${picked}.${COLORS.reset}`);
  }
  return config;
}
async function handleCommand(input, config) {
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
      const levels = [
        { label: "none", value: "none", hint: "no extra reasoning" },
        { label: "low", value: "low", hint: "brief reasoning" },
        { label: "medium", value: "medium", hint: "balanced" },
        { label: "high", value: "high", hint: "deep reasoning" },
        { label: "max", value: "max", hint: "maximum reasoning" }
      ];
      const cur = levels.findIndex((l) => l.value === config.thinkingLevel);
      const picked = await interactiveMenu("Reasoning depth", levels, {
        initialIndex: cur >= 0 ? cur : 2
      });
      if (picked) {
        config.thinkingLevel = picked;
        saveConfig(config);
        console.log(`${COLORS.green}Reasoning set to ${picked}.${COLORS.reset}`);
      }
      return { config, exit: false };
    }
    case "/theme": {
      const opts = Object.entries(THEMES).map(([k, t]) => ({ label: t.label, value: k }));
      const cur = opts.findIndex((o) => o.value === config.theme);
      const picked = await interactiveMenu("Color theme", opts, { initialIndex: cur >= 0 ? cur : 0 });
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
        try {
          await pushAccount(config);
        } catch {
        }
      }
      return { config, exit: false };
    case "/logout":
      await logoutAccount(config);
      config.account = void 0;
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
        console.log(`${COLORS.green}\u2713 Settings synced.${COLORS.reset}`);
      } catch (e) {
        console.log(`${COLORS.red}${e?.message || e}${COLORS.reset}`);
      }
      return { config, exit: false };
    }
    default:
      console.log(`${COLORS.red}Unknown command: ${cmd}${COLORS.reset} ${COLORS.gray}(type / and press Enter to browse)${COLORS.reset}`);
      return { config, exit: false };
  }
}
function showHelp() {
  console.log(`
${COLORS.bold}${COLORS.orange}FreeCode${COLORS.reset} ${COLORS.gray}- Claude Code-style coding agent${COLORS.reset}
`);
  console.log(`${COLORS.bold}Usage${COLORS.reset}`);
  console.log(`  Type a request and press Enter to chat with the agent.`);
  console.log(`  Type ${COLORS.orange}/${COLORS.reset} and press Enter to browse slash commands.
`);
  console.log(`${COLORS.bold}Slash commands${COLORS.reset}`);
  for (const c of COMMANDS) {
    console.log(`  ${COLORS.orange}${c.name.padEnd(10)}${COLORS.reset} ${COLORS.gray}${c.desc}${COLORS.reset}`);
  }
  console.log(`
${COLORS.bold}Navigation${COLORS.reset}`);
  console.log(`  ${COLORS.gray}Use \u2191/\u2193 to move, \u21B5 to select, esc to cancel in any menu.${COLORS.reset}
`);
}
async function runSetup(config) {
  console.log(`
${COLORS.bold}${COLORS.orange}[Config] FreeCode Config Wizard${COLORS.reset}
`);
  const baseURL = await askQuestion(`API base URL ${COLORS.gray}(${config.baseURL})${COLORS.reset}: `);
  if (baseURL.trim()) config.baseURL = baseURL.trim();
  const apiKey = await askQuestion(`API key ${COLORS.gray}(${config.apiKey ? "set" : "empty"})${COLORS.reset}: `);
  if (apiKey.trim()) config.apiKey = apiKey.trim();
  config.autoApprove = await askConfirm("Auto-approve tool actions?", config.autoApprove);
  config.planningMode = await askConfirm("Enable planning mode?", config.planningMode);
  const levels = [
    { label: "none", value: "none", hint: "no extra reasoning" },
    { label: "low", value: "low", hint: "brief reasoning" },
    { label: "medium", value: "medium", hint: "balanced" },
    { label: "high", value: "high", hint: "deep reasoning" },
    { label: "max", value: "max", hint: "maximum reasoning" }
  ];
  const curLevel = levels.findIndex((l) => l.value === config.thinkingLevel);
  const lvl = await interactiveMenu("Reasoning depth", levels, {
    initialIndex: curLevel >= 0 ? curLevel : 2
  });
  if (lvl) config.thinkingLevel = lvl;
  await saveConfig(config);
  console.log(`${COLORS.green}Configuration saved.${COLORS.reset}
`);
  return config;
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
  if (argv.length > 0) {
    const messages2 = [{ role: "user", content: argv.join(" ") }];
    await runAgentLoop(messages2, config);
    return;
  }
  printLogo(config.model, config.baseURL);
  console.log(`${COLORS.gray}Type ${COLORS.orange}/${COLORS.gray} and press Enter to browse commands. Type your request to start.${COLORS.reset}
`);
  const messages = [];
  while (true) {
    const input = await askQuestion(`${COLORS.orange}freecode${COLORS.reset} ${COLORS.gray}\u203A${COLORS.reset} `);
    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("/")) {
      const resolved = await resolveCommand(trimmed);
      if (!resolved) continue;
      const result = await handleCommand(resolved, config);
      config = result.config;
      if (result.exit) break;
      continue;
    }
    messages.push({ role: "user", content: trimmed });
    await runAgentLoop(messages, config);
  }
  console.log(`${COLORS.gray}Goodbye.${COLORS.reset}`);
  process.exit(0);
}
main().catch((err) => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, err);
  process.exit(1);
});
