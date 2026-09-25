// Tiny bash tokenizer for display only. It favours never mangling text over
// perfect classification: every character of the input appears in the output.

export type Tok = { text: string; cls: "comment" | "string" | "flag" | "bin" | "var" | "op" | "plain" };

const OPS = ["&&", "||", "|", ";", ">", "<", "2>", "&"];

export function highlightBash(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let expectBin = true;
  const push = (text: string, cls: Tok["cls"]) => {
    if (text) out.push({ text, cls });
  };
  while (i < line.length) {
    const ch = line[i]!;
    if (/\s/.test(ch)) {
      let j = i;
      while (j < line.length && /\s/.test(line[j]!)) j++;
      push(line.slice(i, j), "plain");
      i = j;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]!))) {
      push(line.slice(i), "comment");
      break;
    }
    if (ch === "'" || ch === '"' || (ch === "$" && line[i + 1] === "'")) {
      const start = i;
      const q = ch === "$" ? "'" : ch;
      i += ch === "$" ? 2 : 1;
      while (i < line.length && line[i] !== q) i += line[i] === "\\" && q === '"' ? 2 : 1;
      push(line.slice(start, i + 1), "string");
      i++;
      expectBin = false;
      continue;
    }
    const op = OPS.find((o) => line.startsWith(o, i));
    if (op) {
      push(op, "op");
      i += op.length;
      expectBin = op !== ">" && op !== "<" && op !== "2>";
      continue;
    }
    let j = i;
    while (j < line.length && !/[\s;|&<>'"]/.test(line[j]!)) j++;
    if (j === i) j = i + 1;
    const word = line.slice(i, j);
    if (word.startsWith("$")) push(word, "var");
    else if (/^-{1,2}[\w-]/.test(word)) push(word, "flag");
    else if (expectBin && !/=/.test(word)) {
      push(word, "bin");
      expectBin = word === "!" || word === "sudo" || word === "nohup" || word === "then" || word === "do" || word === "if";
      i = j;
      continue;
    } else push(word, "plain");
    expectBin = false;
    i = j;
  }
  return out;
}
