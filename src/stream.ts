// Robust streaming parser + live renderer for FreeCode.
// Cleanly separates three channels from an OpenAI-compatible SSE stream so they
// never bleed into each other:
//   1. reasoning  - delta.reasoning_content / reasoning / thinking / thought
//   2. text       - delta.content, with inline <thinking>..</thinking> removed
//   3. tool calls - delta.tool_calls deltas, assembled by index
import { COLORS } from "./ui";

// ---------------------------------------------------------------------------
// 1. SSE decoder: turn a raw text stream into complete JSON events.
// ---------------------------------------------------------------------------
export class SSEDecoder {
  private buffer = "";

  push(chunk: string): any[] {
    this.buffer += chunk;
    const events: any[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const raw = this.buffer.slice(0, nl).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nl + 1);
      const line = raw.trim();
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        events.push(JSON.parse(payload));
      } catch {
        // A data line should hold complete JSON; drop anything malformed.
      }
    }
    return events;
  }
}

// ---------------------------------------------------------------------------
// 2. <thinking> splitter: incremental and safe across partial tags.
// ---------------------------------------------------------------------------
export type Segment = { kind: "text" | "think"; text: string };

const OPEN_TAGS = ["<thinking>", "<think>"];
const CLOSE_TAGS = ["</thinking>", "</think>"];

function firstTag(s: string, tags: string[]): { index: number; tag: string } {
  let index = -1;
  let tag = "";
  for (const t of tags) {
    const i = s.indexOf(t);
    if (i !== -1 && (index === -1 || i < index)) {
      index = i;
      tag = t;
    }
  }
  return { index, tag };
}

// Bytes safe to emit now, holding back any tail that may start a tag.
function safeLen(s: string, tags: string[]): number {
  let hold = 0;
  for (const t of tags) {
    const max = Math.min(s.length, t.length - 1);
    for (let k = max; k > 0; k--) {
      if (s.endsWith(t.slice(0, k))) {
        if (k > hold) hold = k;
        break;
      }
    }
  }
  return s.length - hold;
}

export class ThinkSplitter {
  private inThink = false;
  private pending = "";

  push(chunk: string): Segment[] {
    const out: Segment[] = [];
    let buf = this.pending + chunk;
    this.pending = "";
    while (buf.length) {
      const tags = this.inThink ? CLOSE_TAGS : OPEN_TAGS;
      const kind: "text" | "think" = this.inThink ? "think" : "text";
      const { index, tag } = firstTag(buf, tags);
      if (index === -1) {
        const safe = safeLen(buf, tags);
        if (safe > 0) out.push({ kind, text: buf.slice(0, safe) });
        this.pending = buf.slice(safe);
        break;
      }
      if (index > 0) out.push({ kind, text: buf.slice(0, index) });
      this.inThink = !this.inThink;
      buf = buf.slice(index + tag.length);
    }
    return out;
  }

  flush(): Segment[] {
    if (!this.pending) return [];
    const seg: Segment = { kind: this.inThink ? "think" : "text", text: this.pending };
    this.pending = "";
    return seg.text ? [seg] : [];
  }
}

// ---------------------------------------------------------------------------
// 3. Streaming JSON string-field extractor (for live code panels).
// Decodes the value of `field` from possibly-unterminated JSON arguments.
// ---------------------------------------------------------------------------
export function extractField(partial: string, field: string): string {
  const key = `"${field}"`;
  const ki = partial.indexOf(key);
  if (ki === -1) return "";
  let i = partial.indexOf(":", ki + key.length);
  if (i === -1) return "";
  i++;
  while (i < partial.length && /\s/.test(partial[i])) i++;
  if (partial[i] !== '"') return "";
  i++;
  let out = "";
  while (i < partial.length) {
    const c = partial[i];
    if (c === "\\") {
      const n = partial[i + 1];
      if (n === undefined) break;
      switch (n) {
        case "n": out += "\n"; break;
        case "t": out += "\t"; break;
        case "r": out += "\r"; break;
        case "b": out += "\b"; break;
        case "f": out += "\f"; break;
        case '"': out += '"'; break;
        case "\\": out += "\\"; break;
        case "/": out += "/"; break;
        case "u": {
          const hex = partial.slice(i + 2, i + 6);
          if (hex.length < 4) return out;
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        default: out += n;
      }
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Line styling for streamed assistant text.
// ---------------------------------------------------------------------------
function styleInline(s: string): string {
  s = s.replace(/`([^`]+)`/g, (_m, c) => `${COLORS.cyan}${c}${COLORS.reset}`);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, c) => `${COLORS.bold}${c}${COLORS.reset}`);
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_m, p, c) => `${p}${COLORS.italic}${c}${COLORS.reset}`);
  return s;
}

export function styleLine(line: string): string {
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) return `${COLORS.bold}${COLORS.orange}${h[2]}${COLORS.reset}`;
  const b = line.match(/^(\s*)[-*]\s+(.*)$/);
  if (b) return `${b[1]}${COLORS.orange}\u2022${COLORS.reset} ${styleInline(b[2])}`;
  const n = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (n) return `${n[1]}${COLORS.orange}${n[2]}.${COLORS.reset} ${styleInline(n[3])}`;
  const q = line.match(/^>\s?(.*)$/);
  if (q) return `${COLORS.gray}\u2502 ${styleInline(q[1])}${COLORS.reset}`;
  return styleInline(line);
}

// ---------------------------------------------------------------------------
// 5. Live renderer: owns all on-screen state for one assistant turn.
// Channels are mutually exclusive on screen: opening one closes the others,
// so reasoning, answer text, and code never interleave.
// ---------------------------------------------------------------------------
const RULE = "\u2500".repeat(60);

export class LiveRenderer {
  private thinkOpen = false;
  private responseOpen = false;
  private lineBuf = "";
  private inFence = false;
  private codeOpen = false;
  private codeLabel = "";
  private codeShown = 0;
  reasoningText = "";
  responseText = "";

  private w(s: string) {
    process.stdout.write(s);
  }

  // --- reasoning channel ---
  think(text: string) {
    if (!text) return;
    this.endCode();
    this.flushResponseLine();
    this.openThink();
    this.reasoningText += text;
    const dim = `${COLORS.gray}${COLORS.dim}`;
    this.w(dim + text.replace(/\n/g, `${COLORS.reset}\n${COLORS.gray}\u2502 ${dim}`) + COLORS.reset);
  }
  private openThink() {
    if (this.thinkOpen) return;
    this.w(`\n${COLORS.gray}\u256d\u2500 reasoning ${RULE.slice(11)}${COLORS.reset}\n${COLORS.gray}\u2502 ${COLORS.reset}`);
    this.thinkOpen = true;
  }
  private closeThink() {
    if (!this.thinkOpen) return;
    this.w(`\n${COLORS.gray}\u2570${RULE}${COLORS.reset}\n`);
    this.thinkOpen = false;
  }

  // --- response text channel (line-buffered, styled) ---
  text(chunk: string) {
    if (!chunk) return;
    this.closeThink();
    this.endCode();
    this.openResponse();
    this.responseText += chunk;
    this.lineBuf += chunk;
    let nl: number;
    while ((nl = this.lineBuf.indexOf("\n")) !== -1) {
      const line = this.lineBuf.slice(0, nl);
      this.lineBuf = this.lineBuf.slice(nl + 1);
      this.emitLine(line);
    }
  }
  private openResponse() {
    if (this.responseOpen) return;
    this.w(`\n${COLORS.bold}${COLORS.orange}\u276f${COLORS.reset} `);
    this.responseOpen = true;
  }
  private emitLine(line: string) {
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      this.inFence = !this.inFence;
      this.w(`${COLORS.gray}${line}${COLORS.reset}\n`);
      return;
    }
    if (this.inFence) {
      this.w(`${COLORS.green}${line}${COLORS.reset}\n`);
      return;
    }
    this.w(styleLine(line) + "\n");
  }
  private flushResponseLine() {
    if (this.lineBuf.length) {
      this.emitLine(this.lineBuf);
      this.lineBuf = "";
    }
  }

  // --- live code panel for streamed tool arguments ---
  code(label: string, full: string) {
    this.closeThink();
    this.flushResponseLine();
    if (!this.codeOpen || this.codeLabel !== label) {
      this.endCode();
      this.openCode(label);
    }
    if (full.length <= this.codeShown) return;
    const tail = full.slice(this.codeShown);
    this.codeShown = full.length;
    this.w(`${COLORS.green}` + tail.replace(/\n/g, `${COLORS.reset}\n${COLORS.green}`) + COLORS.reset);
  }
  private openCode(label: string) {
    this.codeLabel = label;
    this.codeShown = 0;
    this.codeOpen = true;
    const dashes = RULE.slice(Math.min(RULE.length, label.length + 4));
    this.w(`\n${COLORS.gray}\u256d\u2500 ${label} ${dashes}${COLORS.reset}\n`);
  }
  private endCode() {
    if (!this.codeOpen) return;
    this.w(`\n${COLORS.gray}\u2570${RULE}${COLORS.reset}\n`);
    this.codeOpen = false;
    this.codeLabel = "";
    this.codeShown = 0;
  }

  // --- finalize the assistant turn ---
  end() {
    this.flushResponseLine();
    this.endCode();
    this.closeThink();
    if (this.responseOpen) this.w("\n");
  }
}
