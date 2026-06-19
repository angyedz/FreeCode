import { z } from "zod";

// Single source of truth for tool argument shapes. Every tool call is parsed
// through these before it ever touches the shell or filesystem, giving us
// safety (no undefined args reaching fs/exec) and clear error messages.

const nonEmpty = (label: string) => z.string({ required_error: `${label} is required` }).min(1, `${label} must not be empty`);

export const toolSchemas: Record<string, z.ZodTypeAny> = {
  list_dir: z.object({ dirPath: z.string().optional() }),
  find_files: z.object({ pattern: nonEmpty("pattern") }),
  view_file: z.object({
    filePath: nonEmpty("filePath"),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
  }),
  write_file: z.object({ filePath: nonEmpty("filePath"), content: z.string() }),
  patch_file: z.object({
    filePath: nonEmpty("filePath"),
    search: nonEmpty("search"),
    replace: z.string(),
  }),
  run_command: z.object({ command: nonEmpty("command") }),
  web_search: z.object({ query: nonEmpty("query") }),
  fetch_url: z.object({ url: nonEmpty("url").url("url must be a valid URL") }),
  grep_search: z.object({ pattern: nonEmpty("pattern"), globPattern: z.string().optional() }),
  create_dir: z.object({ dirPath: nonEmpty("dirPath") }),
  delete_file: z.object({ filePath: nonEmpty("filePath") }),
  move_file: z.object({ sourcePath: nonEmpty("sourcePath"), destPath: nonEmpty("destPath") }),
  append_file: z.object({ filePath: nonEmpty("filePath"), content: z.string() }),
  list_dir_recursive: z.object({ dirPath: z.string().optional() }),
};

export type ToolValidation =
  | { ok: true; value: any }
  | { ok: false; error: string };

// Validate raw (already JSON-parsed) tool arguments against the tool's schema.
// Unknown tools pass through untouched so new tools never hard-fail here.
export function validateToolArgs(toolName: string, args: unknown): ToolValidation {
  const schema = toolSchemas[toolName];
  if (!schema) return { ok: true, value: args };
  const parsed = schema.safeParse(args ?? {});
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: `Invalid arguments for ${toolName}: ${issues}` };
}
