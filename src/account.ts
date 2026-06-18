import { Config } from "./config";

// Default FreeCode account backend (Cloudflare Worker + KV).
export const DEFAULT_SERVER = "https://freecode-accounts.luchue117.workers.dev";

// Config fields that sync to/from the cloud account.
const SYNC_KEYS = [
  "baseURL",
  "apiKey",
  "model",
  "autoApprove",
  "thinkingLevel",
  "planningMode",
  "customModels",
  "theme",
] as const;

export function syncableData(config: Config): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of SYNC_KEYS) out[k] = (config as any)[k];
  return out;
}

export function applySyncedData(config: Config, data: Record<string, any>) {
  for (const k of SYNC_KEYS) {
    if (data[k] !== undefined) (config as any)[k] = data[k];
  }
}

function serverURL(config: Config): string {
  return config.account?.serverURL || DEFAULT_SERVER;
}

async function api(base: string, path: string, method: string, body?: any, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = {};
  try {
    json = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, json };
}

export async function registerAccount(server: string, username: string, password: string) {
  const r = await api(server, "/register", "POST", { username, password });
  if (!r.ok) throw new Error(r.json?.error || `Register failed (${r.status})`);
  return true;
}

export async function loginAccount(server: string, username: string, password: string) {
  const r = await api(server, "/login", "POST", { username, password });
  if (!r.ok) throw new Error(r.json?.error || `Login failed (${r.status})`);
  return { token: r.json.token as string, data: (r.json.data || {}) as Record<string, any> };
}

export async function logoutAccount(config: Config) {
  if (!config.account?.token) return;
  await api(serverURL(config), "/logout", "POST", undefined, config.account.token).catch(() => {});
}

export async function pushAccount(config: Config) {
  if (!config.account?.token) throw new Error("Not logged in");
  const r = await api(serverURL(config), "/account", "PUT", { data: syncableData(config) }, config.account.token);
  if (!r.ok) throw new Error(r.json?.error || `Sync failed (${r.status})`);
  return true;
}

export async function pullAccount(config: Config) {
  if (!config.account?.token) throw new Error("Not logged in");
  const r = await api(serverURL(config), "/account", "GET", undefined, config.account.token);
  if (!r.ok) throw new Error(r.json?.error || `Fetch failed (${r.status})`);
  return (r.json.data || {}) as Record<string, any>;
}
