import fs from "fs/promises";
import path from "path";
import os from "os";

export interface ModelPrice { in: number; out: number }
export type PricingTable = Record<string, ModelPrice>;

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
  // USD per 1M tokens (input/output). Merged over DEFAULT_PRICING.
  pricing?: PricingTable;
  // Where pricing came from (provider docs, manual, etc.) — informational.
  pricingSource?: string;
}

// Approximate USD per 1M tokens. Multi-provider; unknown models fall back to a
// generic rate in estimateCost. Override/extend via config "pricing".
export const DEFAULT_PRICING: PricingTable = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "o3-mini": { in: 1.1, out: 4.4 },
  "claude-3-5-sonnet": { in: 3, out: 15 },
  "claude-3-7-sonnet": { in: 3, out: 15 },
  "claude-sonnet-4": { in: 3, out: 15 },
  "claude-3-5-haiku": { in: 0.8, out: 4 },
  "claude-3-opus": { in: 15, out: 75 },
  "gemini-1.5-pro": { in: 1.25, out: 5 },
  "gemini-1.5-flash": { in: 0.075, out: 0.3 },
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
  "deepseek-chat": { in: 0.27, out: 1.1 },
  "deepseek-reasoner": { in: 0.55, out: 2.19 },
  "llama-3.1-70b": { in: 0.59, out: 0.79 },
  "llama-3.1-405b": { in: 2.7, out: 2.7 },
};

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
    theme: fileConfig.theme || DEFAULT_CONFIG.theme,
    mode: fileConfig.mode || DEFAULT_CONFIG.mode,
    onboarded: fileConfig.onboarded !== undefined ? fileConfig.onboarded : DEFAULT_CONFIG.onboarded,
    account: fileConfig.account,
    pricing: { ...DEFAULT_PRICING, ...(fileConfig.pricing || {}) },
    pricingSource: fileConfig.pricingSource,
  };

  return config;
}

export async function saveConfig(config: Config): Promise<void> {
  // 0600: owner read/write only — the file holds an API key / account token.
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
  try {
    await fs.chmod(CONFIG_FILE, 0o600);
  } catch {
    /* best effort on platforms without POSIX perms */
  }
}

// Mask a secret for display/logging: keep a short prefix/suffix, hide the rest.
export function maskSecret(secret: string | undefined): string {
  if (!secret) return "(none)";
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}\u2026${secret.slice(-2)}`;
}

// Strip secrets from a config before it is printed or exported.
export function redactConfig(config: Config): Config {
  return {
    ...config,
    apiKey: config.apiKey ? "***REDACTED***" : "",
    account: config.account
      ? { ...config.account, token: config.account.token ? "***REDACTED***" : "" }
      : undefined,
  };
}

