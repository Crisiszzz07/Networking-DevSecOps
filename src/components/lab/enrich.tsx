import type { ReactNode } from "react";
import { withCitations, type CitationIndex } from "@/components/hallmark/Cite";
import type { GlossaryEntry } from "@/lib/glossary";
import type { BookRef } from "@/lib/types";
import { GlossaryTerm } from "./GlossaryTerm";

/**
 * Turns plain theory text into citations + glossary terms. Each concept is linked
 * only at its first appearance on the page (used is shared across one render).
 */
export function makeEnricher(books: BookRef[], concepts: GlossaryEntry[], citations: CitationIndex) {
  const used = new Set<string>();
  let key = 0;

  function glossify(text: string): ReactNode[] {
    const out: ReactNode[] = [];
    let rest = text;
    for (;;) {
      let best: { g: GlossaryEntry; index: number; len: number } | null = null;
      for (const g of concepts) {
        if (used.has(g.id)) continue;
        const m = rest.match(g.match);
        if (m && m.index !== undefined && (!best || m.index < best.index)) best = { g, index: m.index, len: m[0].length };
      }
      if (!best) break;
      used.add(best.g.id);
      if (best.index > 0) out.push(rest.slice(0, best.index));
      const entry = { id: best.g.id, term: best.g.term, short: best.g.short, analogy: best.g.analogy, why: best.g.why };
      out.push(
        <GlossaryTerm key={"g" + key++} entry={entry}>
          {rest.slice(best.index, best.index + best.len)}
        </GlossaryTerm>,
      );
      rest = rest.slice(best.index + best.len);
    }
    if (rest) out.push(rest);
    return out;
  }

  function enrichText(text: string): ReactNode[] {
    return withCitations(text, books, citations, "c" + key++).flatMap((node) => (typeof node === "string" ? glossify(node) : [node]));
  }

  return function enrich(children: ReactNode): ReactNode {
    if (typeof children === "string") return enrichText(children);
    if (Array.isArray(children)) {
      return children.map((child, i) => (typeof child === "string" ? <span key={"e" + key++ + "-" + i}>{enrichText(child)}</span> : child));
    }
    return children;
  };
}
