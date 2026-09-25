import type { DetectedCommand } from "./types";

// Walkthrough prose embeds shell commands without backticks
// ("Ejecute tcpdump -ni ln1-r1 … y, en otra terminal, ip netns exec …").
// This scanner recovers them conservatively so they can be copied with one click.

const BINARIES = new Set([
  "ip", "tcpdump", "iptables", "nft", "nc", "ss", "conntrack", "bridge", "kubectl",
  "openssl", "bpftool", "column", "curl", "wget", "sysctl", "ping", "dig", "awk", "grep",
]);

// Spanish words that end a command when they appear unquoted after it.
const STOPWORDS = new Set([
  "y", "e", "o", "en", "muestra", "muestran", "falla", "incrementa", "permite", "contiene",
  "revela", "se", "para", "porque", "tras", "desde", "sin", "con", "al", "que", "es",
]);

type Token = { text: string; start: number; end: number };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i]!)) i++;
    if (i >= input.length) break;
    const start = i;
    let quote: string | null = null;
    while (i < input.length) {
      const ch = input[i]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') {
        quote = ch;
      } else if (/\s/.test(ch)) {
        break;
      }
      i++;
    }
    tokens.push({ text: input.slice(start, i), start, end: i });
  }
  return tokens;
}

const TRAILING = /[.,;]$/;

export function detectCommands(text: string): DetectedCommand[] {
  const tokens = tokenize(text);
  const found: DetectedCommand[] = [];
  let i = 0;
  while (i < tokens.length) {
    const head = tokens[i]!;
    if (!BINARIES.has(head.text.replace(TRAILING, ""))) {
      i++;
      continue;
    }
    const parts: Token[] = [];
    let j = i;
    for (; j < tokens.length; j++) {
      const tok = tokens[j]!;
      if (parts.length > 0 && STOPWORDS.has(tok.text.replace(TRAILING, "").toLowerCase())) break;
      const quoted = /['"]$/.test(tok.text) && /^[$]?['"]/.test(tok.text);
      if (!quoted && TRAILING.test(tok.text)) {
        parts.push({ ...tok, text: tok.text.slice(0, -1), end: tok.end - 1 });
        j++;
        break;
      }
      parts.push(tok);
    }
    const last = parts[parts.length - 1];
    const lastBare = last ? BINARIES.has(last.text) : true;
    if (parts.length >= 2 && !lastBare) {
      const start = parts[0]!.start;
      const end = last!.end;
      found.push({ text: text.slice(start, end), start, end });
    }
    i = Math.max(j, i + 1);
  }
  return found;
}

export function detectExpectation(text: string): string | null {
  const m = text.match(/((?:se esperan?|salida esperada)[^.]*(?:\.[^\s.][^.]*)*\.?)/i);
  return m ? m[1]!.trim() : null;
}
