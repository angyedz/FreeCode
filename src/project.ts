import fs from "fs/promises";
import path from "path";

// FreeCode reads a per-project instruction file (FREECODE.md) and injects it into
// the system prompt so the agent follows project-specific conventions.
const CANDIDATES = ["FREECODE.md", "freecode.md", ".freecode.md"];

export async function loadProjectInstructions(cwd = process.cwd()): Promise<string> {
  for (const name of CANDIDATES) {
    try {
      const content = await fs.readFile(path.resolve(cwd, name), "utf-8");
      if (content.trim()) return content.trim();
    } catch {
      // not found, try next
    }
  }
  return "";
}

// Compose the final system prompt from the base prompt and project instructions.
export function composeSystemPrompt(base: string, instructions: string): string {
  if (!instructions) return base;
  return (
    base +
    "\n\n# PROJECT INSTRUCTIONS (FREECODE.md)\n" +
    "The user maintains the following project-specific guidance. Follow it closely:\n\n" +
    instructions
  );
}

export const FREECODE_TEMPLATE = `# FreeCode Project Guide

This file gives FreeCode persistent, project-specific instructions. It is loaded
automatically at the start of every session and injected into the system prompt.

## Overview
Describe what this project is, its purpose, and its tech stack.

## Conventions
- Code style, formatting, and naming rules to follow.
- Preferred libraries or patterns.
- Things to avoid.

## Commands
- Build: \`npm run build\`
- Test: \`npm test\`
- Run: \`npm start\`

## Notes
Anything else FreeCode should always keep in mind for this project.
`;
