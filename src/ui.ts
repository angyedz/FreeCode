import readline from "readline";

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
};

// Spinner Management
let spinnerInterval: any = null;
const spinnerFrames = ["-", "\\", "|", "/"];
let spinnerFrameIndex = 0;
let spinnerActiveText = "";

export function startSpinner(text: string) {
  if (spinnerInterval) clearInterval(spinnerInterval);
  spinnerActiveText = text;
  process.stderr.write(`\x1b[?25l`); // Hide cursor
  spinnerInterval = setInterval(() => {
    const frame = spinnerFrames[spinnerFrameIndex];
    spinnerFrameIndex = (spinnerFrameIndex + 1) % spinnerFrames.length;
    process.stderr.write(`\r${COLORS.gray}[${frame}]${COLORS.reset} ${spinnerActiveText}\x1b[K`);
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

export async function askConfirm(query: string, defaultYes = true): Promise<boolean> {
  const choice = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await askQuestion(`${COLORS.yellow}${query}${COLORS.reset} ${COLORS.gray}${choice}${COLORS.reset} `);
  if (answer.trim() === "") return defaultYes;
  return answer.trim().toLowerCase().startsWith("y");
}

// Interactive prompt for options
export async function askSelect<T extends string>(query: string, options: { label: string; value: T }[]): Promise<T> {
  console.log(`${COLORS.bold}${COLORS.cyan}[?] ${query}${COLORS.reset}`);
  options.forEach((opt, idx) => {
    console.log(`  ${COLORS.cyan}${idx + 1})${COLORS.reset} ${opt.label}`);
  });
  while (true) {
    const answer = await askQuestion(`Select option (1-${options.length}): `);
    const num = parseInt(answer.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= options.length) {
      return options[num - 1].value;
    }
    console.log(`${COLORS.red}Invalid option. Please try again.${COLORS.reset}`);
  }
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

// Beautiful Logo / Header (Clean monochrome, no emojis)
export function printLogo(modelName: string, baseURL: string) {
  const logo = `
   APEX Agent
   ──────────────────────────────────────────────────
   Model:      ${modelName}
   Endpoint:   ${baseURL}
   Commands:   /help, /config, /clear, /exit, /model, /plan, /think
   ──────────────────────────────────────────────────
  `;
  console.log(logo);
}
