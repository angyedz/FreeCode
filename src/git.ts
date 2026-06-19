import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

// Thin wrappers around git for the /diff, /commit and /status slash-commands.
async function git(args: string): Promise<string> {
  try {
    const { stdout, stderr } = await execPromise(`git ${args}`, {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
    });
    const out = (stdout || "").trimEnd();
    const err = (stderr || "").trimEnd();
    return [out, err].filter(Boolean).join("\n") || "(no output)";
  } catch (e: any) {
    if (/not a git repository/i.test(e.stderr || "")) {
      return "Not a git repository.";
    }
    return `git error: ${(e.stderr || e.message || "").trim()}`;
  }
}

export function gitStatus(): Promise<string> {
  return git("status --short --branch");
}

export function gitDiff(target?: string): Promise<string> {
  const arg = target && target.trim() ? ` ${target.trim()}` : "";
  return git(`diff${arg}`);
}

export async function gitCommit(message: string): Promise<string> {
  if (!message || !message.trim()) {
    return "Provide a commit message: /commit <message>";
  }
  const safe = message.replace(/"/g, '\\"');
  await git("add -A");
  return git(`commit -m "${safe}"`);
}
