import { loadConfig, saveConfig, type Config } from "./config";
import { COLORS, printLogo, askQuestion, askConfirm, askSelect } from "./ui";
import { runAgentLoop, type Message, SYSTEM_PROMPT } from "./agent";
import { fetchModels } from "./models";
import path from "path";

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    model: "",
    baseURL: "",
    apiKey: "",
    autoApprove: false,
    config: false,
    help: false,
  };
  const messageParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model" || arg === "-m") {
      flags.model = args[++i] || "";
    } else if (arg === "--base-url" || arg === "-u") {
      flags.baseURL = args[++i] || "";
    } else if (arg === "--api-key" || arg === "-k") {
      flags.apiKey = args[++i] || "";
    } else if (arg === "--auto-approve" || arg === "-a") {
      flags.autoApprove = true;
    } else if (arg === "--config") {
      flags.config = true;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else {
      messageParts.push(arg);
    }
  }

  return { flags, message: messageParts.join(" ") };
}

function showHelp() {
  console.log(`
  ${COLORS.bold}APEX Agent - Claude Code style terminal assistant${COLORS.reset}

  ${COLORS.bold}Usage:${COLORS.reset}
    ./apex                            Start interactive session
    ./apex <message>                  Run single message and exit
    ./apex --config                   Configure API settings

  ${COLORS.bold}Options:${COLORS.reset}
    -m, --model <name>                Override API model
    -u, --base-url <url>              Override API base URL
    -k, --api-key <key>               Override API key
    -a, --auto-approve                Auto-approve all tool calls
    -h, --help                        Show this help message

  ${COLORS.bold}Interactive Commands:${COLORS.reset}
    /help                             Show help text
    /config                           Open setup wizard
    /clear                            Clear terminal screen
    /exit                             Exit interactive assistant
    /plan                             Toggle planning mode
    /think [level]                    Set thinking level (none, low, medium, high, max)
    /model                            Select active model
    /model list                       List available models
    /model add <name> <id>            Add a custom model
  `);
}

async function runSetup(current: Config) {
  console.log(`\n${COLORS.bold}${COLORS.cyan}[Config] APEX Config Wizard${COLORS.reset}`);
  console.log(`${COLORS.gray}Configure your OpenAI-compatible endpoint below.${COLORS.reset}\n`);

  const baseURL = await askQuestion(`Base URL [${current.baseURL}]: `);
  const currentKeyDisplay = current.apiKey 
    ? `ends in ...${current.apiKey.slice(-4)}`
    : "none";
  const apiKey = await askQuestion(`API Key [${currentKeyDisplay}]: `);
  const model = await askQuestion(`Model [${current.model}]: `);
  const autoApprove = await askConfirm(`Auto-approve file modifications?`, current.autoApprove);

  const nextConfig: Config = {
    ...current,
    baseURL: baseURL.trim() || current.baseURL,
    apiKey: apiKey.trim() || current.apiKey,
    model: model.trim() || current.model,
    autoApprove,
  };

  await saveConfig(nextConfig);
  console.log(`\n${COLORS.green}[OK] Settings updated and saved!${COLORS.reset}\n`);
  return nextConfig;
}

async function main() {
  const { flags, message } = parseArgs();

  if (flags.help) {
    showHelp();
    process.exit(0);
  }

  let config = await loadConfig();

  if (flags.config) {
    await runSetup(config);
    process.exit(0);
  }

  if (flags.model) config.model = flags.model;
  if (flags.baseURL) config.baseURL = flags.baseURL;
  if (flags.apiKey) config.apiKey = flags.apiKey;
  if (flags.autoApprove) config.autoApprove = true;

  if (!config.apiKey && config.baseURL.includes("openai.com")) {
    console.log(`${COLORS.yellow}[WARN] No API key found for OpenAI endpoint.${COLORS.reset}`);
    const setupNow = await askConfirm("Would you like to run the config wizard now?");
    if (setupNow) {
      config = await runSetup(config);
    } else {
      console.log(`${COLORS.bold}Continuing without API key...${COLORS.reset}`);
    }
  }

  if (message.trim().length > 0) {
    console.log(`${COLORS.gray}[INFO] Executing single instruction...${COLORS.reset}`);
    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message },
    ];
    await runAgentLoop(messages, config);
    process.exit(0);
  }

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT }
  ];

  printLogo(config.model, config.baseURL);
  console.log(`Type your prompt and press ${COLORS.bold}Enter${COLORS.reset}. Type ${COLORS.cyan}/help${COLORS.reset} for command details.\n`);

  while (true) {
    const relativeCwd = path.basename(process.cwd()) || "/";
    const prompt = `${COLORS.bold}${COLORS.green}apex${COLORS.reset} ${COLORS.dim}(${config.model})${COLORS.reset} ${COLORS.cyan}${relativeCwd}${COLORS.reset} › `;
    const input = await askQuestion(prompt);
    const trimmed = input.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("/")) {
      const parts = trimmed.split(/\s+/);
      const command = parts[0].toLowerCase();
      
      if (command === "/exit" || command === "/quit") {
        console.log(`Goodbye!`);
        break;
      } else if (command === "/help") {
        showHelp();
      } else if (command === "/config") {
        config = await runSetup(config);
      } else if (command === "/clear") {
        console.clear();
        printLogo(config.model, config.baseURL);
      } else if (command === "/plan") {
        config.planningMode = !config.planningMode;
        await saveConfig(config);
        console.log(`Planning mode: ${config.planningMode ? "ON" : "OFF"}`);
      } else if (command === "/think") {
        const level = parts[1]?.toLowerCase();
        const validLevels = ["none", "low", "medium", "high", "max"];
        if (level && validLevels.includes(level)) {
          config.thinkingLevel = level as any;
          await saveConfig(config);
          console.log(`Thinking level set to: ${config.thinkingLevel}`);
        } else {
          const selectOpts = validLevels.map(l => ({ label: l, value: l }));
          const chosen = await askSelect("Select thinking level:", selectOpts);
          config.thinkingLevel = chosen as any;
          await saveConfig(config);
          console.log(`Thinking level set to: ${config.thinkingLevel}`);
        }
      } else if (command === "/model") {
        const sub = parts[1]?.toLowerCase();
        if (sub === "add") {
          const name = parts[2];
          const id = parts[3];
          if (!name || !id) {
            console.log(`${COLORS.red}[ERR] Usage: /model add <name> <id>${COLORS.reset}`);
          } else {
            config.customModels.push({ name, id });
            await saveConfig(config);
            console.log(`Custom model added: ${name} (${id})`);
          }
        } else if (sub === "list") {
          console.log(`\nAvailable Models:`);
          try {
            const apiModels = await fetchModels(config);
            if (apiModels.length > 0) {
              console.log(`${COLORS.bold}API Models:${COLORS.reset}`);
              apiModels.forEach(m => console.log(`  - ${m}`));
            }
          } catch (e: any) {
            console.log(`${COLORS.yellow}[WARN] Could not fetch models from API: ${e.message}${COLORS.reset}`);
          }
          if (config.customModels.length > 0) {
            console.log(`${COLORS.bold}Custom Models:${COLORS.reset}`);
            config.customModels.forEach(m => console.log(`  - ${m.name} (${m.id})`));
          }
          console.log(`Active model: ${COLORS.cyan}${config.model}${COLORS.reset}\n`);
        } else if (parts[1]) {
          const target = parts[1];
          config.model = target;
          await saveConfig(config);
          console.log(`Active model changed to: ${config.model}`);
        } else {
          console.log(`Fetching models list...`);
          let apiModels: string[] = [];
          try {
            apiModels = await fetchModels(config);
          } catch (e: any) {
            console.log(`${COLORS.yellow}[WARN] Could not fetch models from API: ${e.message}${COLORS.reset}`);
          }
          
          const options: { label: string; value: string }[] = [];
          apiModels.forEach(m => {
            options.push({ label: `${m} (API)`, value: m });
          });
          config.customModels.forEach(m => {
            options.push({ label: `${m.name} (${m.id}) (Custom)`, value: m.id });
          });
          
          if (options.length === 0) {
            console.log(`No models found. You can add one via: /model add <name> <id>`);
          } else {
            const chosen = await askSelect("Select active model:", options);
            config.model = chosen;
            await saveConfig(config);
            console.log(`Active model changed to: ${config.model}`);
          }
        }
      } else {
        console.log(`${COLORS.red}Unknown command: ${command}. Type /help for assistance.${COLORS.reset}`);
      }
      continue;
    }

    let promptContent = trimmed;
    if (config.planningMode) {
      promptContent = `[Planning Mode Active] Please outline a detailed plan first using monochrome box layouts. Map out steps from research to execution and verification. Proceed with tasks step by step.\n\nUser Message: ${trimmed}`;
    }
    messages.push({ role: "user", content: promptContent });

    await runAgentLoop(messages, config);
    console.log();
  }
}

main().catch(err => {
  console.error(`${COLORS.red}Fatal Error: ${err.message}${COLORS.reset}`);
  process.exit(1);
});
