import fs from "fs/promises";
import path from "path";
import os from "os";

export interface Config {
  baseURL: string;
  apiKey: string;
  model: string;
  autoApprove: boolean;
  thinkingLevel: "none" | "low" | "medium" | "high" | "max";
  planningMode: boolean;
  customModels: { name: string; id: string }[];
  theme: string;
  mode: "local" | "cloud";
  onboarded: boolean;
  account?: { serverURL: string; username: string; token: string };
}

const CONFIG_FILE = path.join(os.homedir(), ".apex-agent.json");

const DEFAULT_CONFIG: Config = {
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  autoApprove: false,
  thinkingLevel: "medium",
  planningMode: false,
  customModels: [],
  theme: "ember",
  mode: "local",
  onboarded: false,
};

export async function loadConfig(): Promise<Config> {
  const envBaseURL = process.env.OPENAI_BASE_URL || process.env.APEX_BASE_URL;
  const envApiKey = process.env.OPENAI_API_KEY || process.env.APEX_API_KEY;
  const envModel = process.env.OPENAI_MODEL || process.env.APEX_MODEL;
  const envAutoApprove = process.env.APEX_AUTO_APPROVE === "true";

  let fileConfig: Partial<Config> = {};
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    fileConfig = JSON.parse(data);
  } catch (e) {
    // Keep default settings
  }

  const config: Config = {
    baseURL: envBaseURL || fileConfig.baseURL || DEFAULT_CONFIG.baseURL,
    apiKey: envApiKey || fileConfig.apiKey || DEFAULT_CONFIG.apiKey,
    model: envModel || fileConfig.model || DEFAULT_CONFIG.model,
    autoApprove: envAutoApprove || fileConfig.autoApprove || DEFAULT_CONFIG.autoApprove,
    thinkingLevel: fileConfig.thinkingLevel || DEFAULT_CONFIG.thinkingLevel,
    planningMode: fileConfig.planningMode !== undefined ? fileConfig.planningMode : DEFAULT_CONFIG.planningMode,
    customModels: fileConfig.customModels || DEFAULT_CONFIG.customModels,
  };

  return config;
}

export async function saveConfig(config: Config): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

