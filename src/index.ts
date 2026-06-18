import { loadConfig, saveConfig, type Config } from "./config";
import { COLORS, printLogo, askQuestion, askConfirm, interactiveMenu, type MenuOption } from "./ui";
import { runAgentLoop, type Message, SYSTEM_PROMPT } from "./agent";
import { fetchModels } from "./models";
import path from "path";

const COMMANDS: { name: string; desc: string }[] = [
  { name: "/help", desc: "Show help and commands" },
  { name: "/model", desc: "Switch the active model" },
  { name: "/think", desc: "Set reasoning depth" },
  { name: "/plan", desc: "Toggle planning mode" },
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

async function main() {
  let config = await loadConfig();
  const argv = process.argv.slice(2);

  if (argv[0] === "--help" || argv[0] === "-h") {
    showHelp();
    return;
  }
  if (argv[0] === "config" || argv[0] === "setup") {
    config = await runSetup(config);
    return;
  }

  if (!config.apiKey) {
    console.log(`${COLORS.gray}No API key found. Starting setup.${COLORS.reset}`);
    config = await runSetup(config);
  }

  // One-shot mode: pass a prompt as arguments to run once and exit.
  if (argv.length > 0) {
    const messages: Message[] = [{ role: "user", content: argv.join(" ") }];
    await runAgentLoop(messages, config);
    return;
  }

  printLogo(config.model, config.baseURL);
  console.log(`${COLORS.gray}Type ${COLORS.orange}/${COLORS.gray} and press Enter to browse commands. Type your request to start.${COLORS.reset}\n`);

  const messages: Message[] = [];
  while (true) {
    const input = await askQuestion(`${COLORS.orange}freecode${COLORS.reset} ${COLORS.gray}\u203a${COLORS.reset} `);
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
