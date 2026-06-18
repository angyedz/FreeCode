import type { Config } from "./config";

export async function fetchModels(config: Config): Promise<string[]> {
  const url = `${config.baseURL.replace(/\/$/, "")}/models`;
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    const data = await response.json() as any;
    if (data && Array.isArray(data.data)) {
      return data.data.map((m: any) => m.id);
    }
  } catch (e: any) {
    throw new Error(`Failed to fetch models: ${e.message}`);
  }
  return [];
}
