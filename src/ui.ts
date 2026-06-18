import readline from "readline";
import os from "os";

// ANSI Terminal Codes
export const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  lightGray: "\x1b[37m",
  bgGray: "\x1b[100m",
  orange: "\x1b[38;5;208m",
  dimOrange: "\x1b[38;5;130m",
};

// Spinner Management
let spinnerInterval: any = null;
const spinnerFrames = ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"];
let spinnerFrameIndex = 0;
let spinnerActiveText = "";

export function startSpinner(text: string) {
  if (spinnerInterval) clearInterval(spinnerInterval);
  spinnerActiveText = text;
  process.stderr.write(`\x1b[?25l`); // Hide cursor
  spinnerInterval = setInterval(() => {
    const frame = spinnerFrames[spinnerFrameIndex];
    spinnerFrameIndex = (spinnerFrameIndex + 1) % spinnerFrames.length;
    process.stderr.write(`\r${COLORS.orange}${frame}${COLORS.reset} ${spinnerActiveText}\x1b[K`);
  }, 100);
}

export function updateSpinner(text: string) {
  spinnerActiveText = text;
}

export function stopSpinner(success = true, statusText?: string) {
  if (!spinnerInterval) return;
  clearInterval(spinnerInterval);
  spinnerInterval = null;
  process.stderr.write(`\r\x1b[?25h\x1b[K`); // Show cursor and clear line
  if (statusText) {
    if (success) {
      console.log(`${COLORS.green}[OK]${COLORS.reset} ${statusText}`);
    } else {
      console.log(`${COLORS.red}[ERR]${COLORS.reset} ${statusText}`);
    }
  }
}

// User Prompt Interfaces
export function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export interface MenuOption<T> {
  label: string;
  value: T;
  hint?: string;
}

// Arrow-key yes/no confirm (falls back to text when not a TTY)
export async function askConfirm(query: string, defaultYes = true): Promise<boolean> {
  const chosen = await interactiveMenu<boolean>(
    query,
    [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
    { initialIndex: defaultYes ? 0 : 1 }
  );
  return chosen === null ? defaultYes : chosen;
}

// Backwards-compatible select (cancel resolves to the first option)
export async function askSelect<T extends string>(
  query: string,
  options: { label: string; value: T }[]
): Promise<T> {
  const chosen = await interactiveMenu<T>(query, options);
  return chosen ?? options[0].value;
}

// Diff Visualizer (Claude Code Style)
export function renderDiff(filePath: string, search: string, replace: string) {
  console.log(`\n${COLORS.cyan}--- ${filePath} (original)${COLORS.reset}`);
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

// Markdown Renderer for CLI
export function renderMarkdown(text: string): string {
  let output = text;

  // Code blocks: ```js ... ```
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  output = output.replace(codeBlockRegex, (match, lang, code) => {
    const border = `${COLORS.gray}│${COLORS.reset} `;
    const indentedCode = code
      .split("\n")
      .map((line: string) => `${border}${COLORS.lightGray}${line}${COLORS.reset}`)
      .join("\n");
    const header = `${COLORS.gray}┌───${COLORS.reset} ${COLORS.bold}${COLORS.cyan}${lang || "code"}${COLORS.reset} ${COLORS.gray}─────────────────────────────────────────${COLORS.reset}\n`;
    const footer = `\n${COLORS.gray}└────────────────────────────────────────────────────────${COLORS.reset}`;
    return `\n${header}${indentedCode}${footer}\n`;
  });

  // Inline code: `code`
  output = output.replace(/`([^`\n]+)`/g, `${COLORS.magenta}$1${COLORS.reset}`);

  // Bold: **text**
  output = output.replace(/\*\*([^*]+)\*\*/g, `${COLORS.bold}$1${COLORS.reset}`);

  // Italic: *text*
  output = output.replace(/\*([^*]+)\*/g, `${COLORS.italic}$1${COLORS.reset}`);

  // Headings: ### Heading
  output = output.replace(/^### (.*)$/gm, `\n${COLORS.bold}${COLORS.cyan}### $1${COLORS.reset}`);
  output = output.replace(/^## (.*)$/gm, `\n${COLORS.bold}${COLORS.cyan}## $1${COLORS.reset}`);
  output = output.replace(/^# (.*)$/gm, `\n${COLORS.bold}${COLORS.cyan}# $1${COLORS.reset}`);

  // Bullets: - item
  output = output.replace(/^[-\*] (.*)$/gm, `  ${COLORS.cyan}*${COLORS.reset} $1`);

  return output;
}

// Strip ANSI escape codes to measure visible width
function visibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

// Pad (or truncate) a possibly-colored cell to a fixed visible width
function padCell(s: string, width: number): string {
  const len = visibleLen(s);
  if (len > width) {
    const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
    return plain.slice(0, Math.max(0, width - 1)) + "\u2026";
  }
  return s + " ".repeat(width - len);
}

// Welcome banner (Claude Code style, two-panel dashed box)
export function printLogo(modelName: string, baseURL: string) {
  const { orange: O, reset: R, gray: D, bold: B, dimOrange: DO } = COLORS;

  let user = "developer";
  try { user = os.userInfo().username || user; } catch {}
  const home = os.homedir();
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
    `${O}█▀▀ █▀▄ █▀▀ █▀▀${R}`,
    `${O}█▀  █▀▄ █▀  █▀ ${R}`,
    `${O}▀   ▀ ▀ ▀▀▀ ▀▀▀${R}`,
    `${O}█▀▀ █▀█ █▀▄ █▀▀${R}`,
    `${O}█   █ █ █ █ █▀ ${R}`,
    `${O}▀▀▀ ▀▀▀ ▀▀▀ ▀▀▀${R}`,
    "",
    `${D}${modelName} \u00b7 Max 20x${R}`,
    `${D}${endpoint}${R}`,
    `${D}${cwd}${R}`,
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
    `${D}...${R}      /help for more`,
  ];

  const rows = Math.max(left.length, right.length);
  const out: string[] = [];
  out.push(`${O}\u256d${"\u2504".repeat(width)}\u256e${R}`);
  for (let i = 0; i < rows; i++) {
    const l = padCell(left[i] ?? "", LW);
    const r = padCell(right[i] ?? "", RW);
    out.push(`${O}\u250a${R} ${l}${" ".repeat(GAP)}${r} ${O}\u250a${R}`);
  }
  out.push(`${O}\u2570${"\u2504".repeat(width)}\u256f${R}`);

  console.log("\n" + out.join("\n") + "\n");
}

// ───────────────── Interactive TUI ─────────────────
function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function out(s: string) {
  process.stdout.write(s);
}

// Fallback for non-TTY input (pipes): classic numbered prompt.
async function numberedFallback<T>(title: string, options: MenuOption<T>[]): Promise<T | null> {
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

// Arrow-key menu. Returns the chosen value, or null when cancelled.
export function interactiveMenu<T>(
  title: string,
  options: MenuOption<T>[],
  opts: { filterable?: boolean; initialIndex?: number; pageSize?: number; columns?: number } = {}
): Promise<T | null> {
  if (!isInteractive() || options.length === 0) return numberedFallback(title, options);
  const stdin = process.stdin as NodeJS.ReadStream;
  return new Promise<T | null>((resolve) => {
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();

    let filter = "";
    let index = Math.max(0, Math.min(opts.initialIndex ?? 0, options.length - 1));
    let prev = 0;
    let offsetRow = 0;

    const visible = () =>
      opts.filterable && filter
        ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))
        : options;

    // Compute grid layout from terminal width and longest label.
    const layout = (items: MenuOption<T>[]) => {
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
      const lines: string[] = [];
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
            const ptr = active ? `${COLORS.orange}\u276f${COLORS.reset}` : " ";
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
      const scroll = totalRows > rows ? ` \u00b7 PgUp/PgDn` : "";
      lines.push(`${COLORS.gray}${pos} \u00b7 ${nav}${scroll} \u00b7 \u21b5 select \u00b7 esc cancel${COLORS.reset}`);
      if (prev > 0) out(`\x1b[${prev}A`);
      out(lines.map((l) => `\x1b[2K${l}`).join("\n") + "\n\x1b[J");
      prev = lines.length;
    };

    const cleanup = () => {
      stdin.removeListener("keypress", onKey);
      if (stdin.isTTY) stdin.setRawMode(false);
      out("\x1b[?25h");
    };

    const onKey = (str: string, key: any) => {
      const items = visible();
      const len = items.length;
      const { cols, rows } = layout(items);
      const page = cols * rows;
      const clamp = () => { if (index < 0) index = 0; if (index > len - 1) index = Math.max(0, len - 1); draw(); };
      if (key && key.ctrl && key.name === "c") {
        cleanup(); out("\n"); process.exit(130);
      } else if (key && key.name === "left") {
        if (len) index = (index - 1 + len) % len; draw();
      } else if (key && (key.name === "right" || (key.name === "tab" && !key.shift))) {
        if (len) index = (index + 1) % len; draw();
      } else if (key && (key.name === "up" || (key.shift && key.name === "tab"))) {
        index -= cols; clamp();
      } else if (key && key.name === "down") {
        index += cols; clamp();
      } else if (key && key.name === "pageup") {
        index -= page; clamp();
      } else if (key && key.name === "pagedown") {
        index += page; clamp();
      } else if (key && key.name === "home") {
        index = 0; draw();
      } else if (key && key.name === "end") {
        index = Math.max(0, len - 1); draw();
      } else if (key && (key.name === "return" || key.name === "enter")) {
        const chosen = items[index];
        cleanup();
        if (prev > 0) out(`\x1b[${prev}A\x1b[J`);
        if (chosen) {
          out(`${COLORS.orange}\u2713${COLORS.reset} ${title} ${COLORS.gray}\u203a${COLORS.reset} ${COLORS.orange}${chosen.label}${COLORS.reset}\n`);
          resolve(chosen.value);
        } else resolve(null);
      } else if (key && key.name === "escape") {
        cleanup();
        if (prev > 0) out(`\x1b[${prev}A\x1b[J`);
        out(`${COLORS.gray}\u2717 ${title} (cancelled)${COLORS.reset}\n`);
        resolve(null);
      } else if (opts.filterable && key && key.name === "backspace") {
        filter = filter.slice(0, -1); index = 0; draw();
      } else if (opts.filterable && key && str && str.length === 1 && str >= " " && !key.ctrl) {
        filter += str; index = 0; draw();
      }
    };

    out("\x1b[?25l");
    stdin.on("keypress", onKey);
    draw();
  });
}
