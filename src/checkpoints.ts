import fs from "fs/promises";
import path from "path";

// In-memory undo journal. Each user turn opens a checkpoint; file tools record
// the pre-edit state of every file they touch so /undo can revert the turn.
interface FileSnapshot { path: string; existed: boolean; content: string | null; }
interface Checkpoint { id: number; label: string; time: string; snaps: Map<string, FileSnapshot>; }

let current: Checkpoint | null = null;
const stack: Checkpoint[] = [];
let counter = 0;

export function beginCheckpoint(label: string) {
  counter++;
  current = { id: counter, label, time: new Date().toISOString(), snaps: new Map() };
}

// Called by file-mutating tools before they change a file.
export async function recordBackup(absPath: string) {
  if (!current || current.snaps.has(absPath)) return;
  let existed = true;
  let content: string | null = null;
  try {
    content = await fs.readFile(absPath, "utf-8");
  } catch {
    existed = false;
  }
  current.snaps.set(absPath, { path: absPath, existed, content });
}

export function commitCheckpoint() {
  if (current && current.snaps.size > 0) stack.push(current);
  current = null;
}

export function listCheckpoints() {
  return stack.map((c) => ({ id: c.id, label: c.label, time: c.time, files: c.snaps.size }));
}

export function hasCheckpoints(): boolean {
  return stack.length > 0;
}

// Revert the most recent committed checkpoint. Returns a human-readable summary.
export async function undoLast(): Promise<string> {
  const cp = stack.pop();
  if (!cp) return "Nothing to undo.";
  let restored = 0;
  let failed = 0;
  for (const snap of cp.snaps.values()) {
    try {
      if (snap.existed) {
        await fs.mkdir(path.dirname(snap.path), { recursive: true });
        await fs.writeFile(snap.path, snap.content ?? "", "utf-8");
      } else {
        await fs.rm(snap.path, { force: true });
      }
      restored++;
    } catch {
      failed++;
    }
  }
  const suffix = failed > 0 ? `, ${failed} failed` : "";
  return `Reverted "${cp.label}" \u2014 ${restored} file(s) restored${suffix}.`;
}
