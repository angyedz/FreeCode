import { Config, saveConfig } from "./config";
import {
  COLORS,
  THEMES,
  applyTheme,
  printBanner,
  askQuestion,
  askPassword,
  askConfirm,
  interactiveMenu,
  type MenuOption,
} from "./ui";
import {
  DEFAULT_SERVER,
  registerAccount,
  loginAccount,
  pushAccount,
  applySyncedData,
} from "./account";

// First-run wizard: banner -> theme -> mode -> (account) -> API -> behavior.
export async function runOnboarding(config: Config): Promise<Config> {
  console.clear();
  printBanner("Welcome — let's set up FreeCode");

  // 1) Theme (applied live so the rest of the wizard uses it).
  const themeOpts: MenuOption<string>[] = Object.entries(THEMES).map(
    ([k, t]) => ({ label: t.label, value: k })
  );
  const curTheme = themeOpts.findIndex((o) => o.value === config.theme);
  const theme = await interactiveMenu<string>("Choose a color theme", themeOpts, {
    initialIndex: curTheme >= 0 ? curTheme : 0,
  });
  if (theme) {
    config.theme = theme;
    applyTheme(theme);
  }
  console.clear();
  printBanner("Theme applied — looking good");

  // 2) Mode.
  const mode = await interactiveMenu<"local" | "cloud">(
    "How do you want to use FreeCode?",
    [
      { label: "Local only", value: "local", hint: "settings stored on this machine" },
      { label: "With an account", value: "cloud", hint: "sync settings across devices" },
    ],
    { initialIndex: config.mode === "cloud" ? 1 : 0 }
  );
  config.mode = mode || "local";

  if (config.mode === "cloud") config = await loginFlow(config);

  // 3) API connection.
  config = await setupApi(config);

  // 4) Behavior.
  config.autoApprove = await askConfirm("Auto-approve tool actions?", config.autoApprove);

  config.onboarded = true;
  await saveConfig(config);
  if (config.mode === "cloud" && config.account?.token) {
    try { await pushAccount(config); } catch {}
  }
  console.log(`\n${COLORS.green}✓ Setup complete. Launching FreeCode…${COLORS.reset}\n`);
  return config;
}

// Interactive login/register flow. Reusable from /login command.
export async function loginFlow(config: Config): Promise<Config> {
  const server = config.account?.serverURL || DEFAULT_SERVER;
  while (true) {
    const action = await interactiveMenu<string>("Account", [
      { label: "Log in", value: "login", hint: "existing account" },
      { label: "Register", value: "register", hint: "create a new account" },
      { label: "Skip for now", value: "skip", hint: "stay local" },
    ], {});
    if (!action || action === "skip") { config.mode = "local"; return config; }

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
      console.log(`${COLORS.green}✓ Logged in as ${username}.${COLORS.reset}`);
      return config;
    } catch (e: any) {
      console.log(`${COLORS.red}${e?.message || e}${COLORS.reset}`);
      const retry = await askConfirm("Try again?", true);
      if (!retry) { config.mode = "local"; return config; }
    }
  }
}

async function setupApi(config: Config): Promise<Config> {
  console.log(`\n${COLORS.bold}${COLORS.orange}API connection${COLORS.reset}`);
  const baseURL = await askQuestion(`API base URL ${COLORS.gray}(${config.baseURL})${COLORS.reset}: `);
  if (baseURL.trim()) config.baseURL = baseURL.trim();
  const apiKey = await askPassword(`API key ${COLORS.gray}(${config.apiKey ? "keep current" : "required"})${COLORS.reset}: `);
  if (apiKey.trim()) config.apiKey = apiKey.trim();
  return config;
}
