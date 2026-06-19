import fs from "fs/promises";
import path from "path";

// Users can reference files inline with @path/to/file. expandMentions reads those
// files and appends their contents to the message so the agent has the context.
const MENTION_RE = /(?:^|\s)@([^\s]+)/g;
const MAX_BYTES = 12000;

export async function expandMentions(input: string): Promise<string> {
  const matches = [...input.matchAll(MENTION_RE)];
  if (matches.length === 0) return input;

  const seen = new Set<string>();
  let attached = "";
  for (const m of matches) {
    const rel = m[1].replace(/[.,;:)]+$/, "");
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    const target = path.resolve(process.cwd(), rel);
    try {
      let content = await fs.readFile(target, "utf-8");
      let note = "";
      if (content.length > MAX_BYTES) {
        content = content.slice(0, MAX_BYTES);
        note = "\n... [truncated]";
      }
      attached += `\n\n--- File: ${rel} ---\n${content}${note}`;
    } catch {
      attached += `\n\n--- File: ${rel} (could not be read) ---`;
    }
  }

  if (!attached) return input;
  return `${input}\n\n[Referenced file context follows]${attached}`;
}

// Returns the list of @-mentioned paths in an input (used for UI feedback).
export function findMentions(input: string): string[] {
  return [...input.matchAll(MENTION_RE)].map((m) => m[1].replace(/[.,;:)]+$/, ""));
}
