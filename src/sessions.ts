import fs from "fs/promises";
import path from "path";
import os from "os";
import type { Message } from "./agent";

// Sessions are persisted as JSON under ~/.freecode/sessions so conversations can
// be resumed later with /resume.
const DIR = path.join(os.homedir(), ".freecode", "sessions");

export interface SessionMeta {
  id: string;
  title: string;
  updated: string;
  cwd: string;
  count: number;
}

export function newSessionId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// Hard cap on a single session file. Long coding sessions with big tool
// outputs can otherwise balloon to many MB.
const MAX_SESSION_BYTES = 1_000_000; // ~1MB

// Trim the oldest messages (keeping the system prompt) until the serialized
// payload fits under the cap. A summary placeholder records what was dropped.
function capMessages(messages: Message[]): Message[] {
  const fits = (msgs: Message[]) => Buffer.byteLength(JSON.stringify(msgs), "utf-8") <= MAX_SESSION_BYTES;
  if (fits(messages)) return messages;

  const system = messages[0]?.role === "system" ? [messages[0]] : [];
  const rest = messages.slice(system.length);
  let dropped = 0;
  const note = (): Message => ({ role: "system", content: `[${dropped} earlier message(s) trimmed to keep the session under 1MB]` });
  while (rest.length > 1 && !fits([...system, note(), ...rest])) {
    rest.shift();
    dropped++;
  }
  if (dropped === 0) return messages;
  return [...system, note(), ...rest];
}

export async function saveSession(id: string, messages: Message[], title: string): Promise<void> {
  try {
    await fs.mkdir(DIR, { recursive: true });
    const capped = capMessages(messages);
    const data = { id, title, updated: new Date().toISOString(), cwd: process.cwd(), messages: capped };
    await fs.writeFile(path.join(DIR, `${id}.json`), JSON.stringify(data), "utf-8");
  } catch {
    // saving is best-effort; never crash the REPL over it
  }
}

export async function listSessions(): Promise<SessionMeta[]> {
  try {
    const files = await fs.readdir(DIR);
    const metas: SessionMeta[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const d = JSON.parse(await fs.readFile(path.join(DIR, f), "utf-8"));
        metas.push({
          id: d.id,
          title: d.title || "(untitled)",
          updated: d.updated || "",
          cwd: d.cwd || "",
          count: Array.isArray(d.messages) ? d.messages.length : 0,
        });
      } catch {
        // skip corrupt file
      }
    }
    return metas.sort((a, b) => (a.updated < b.updated ? 1 : -1));
  } catch {
    return [];
  }
}

export async function loadSession(id: string): Promise<Message[] | null> {
  try {
    const d = JSON.parse(await fs.readFile(path.join(DIR, `${id}.json`), "utf-8"));
    return Array.isArray(d.messages) ? d.messages : null;
  } catch {
    return null;
  }
}
