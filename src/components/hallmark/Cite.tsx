import type { ReactNode } from "react";
import type { BookRef } from "@/lib/types";

const CITATION = /\[([A-Za-z&]{2,6},\s*caps?\.[^\]]+)\]/g;

type CitationRecord = {
  number: number;
  reference: string;
  detail: string;
};

export type CitationIndex = Map<string, CitationRecord>;

const BOOK_META: Record<string, { authors: string; publisher: string }> = {
  "Practical Packet Analysis": { authors: "Chris Sanders", publisher: "No Starch Press" },
  "Networking and Kubernetes: A Layered Approach": { authors: "James Strong y Vallery Lancey", publisher: "O'Reilly Media" },
  "Learning eBPF": { authors: "Liz Rice", publisher: "O'Reilly Media" },
  "Zero Trust Networks": { authors: "Evan Gilman y Doug Barth", publisher: "O'Reilly Media" },
  "Securing DevOps: Security in the Cloud": { authors: "Julien Vehent", publisher: "Manning" },
};

function citationParts(reference: string, books: BookRef[]) {
  const abbr = reference.split(",", 1)[0]!.trim();
  const book = books.find((candidate) => candidate.abbr === abbr);
  const meta = book ? BOOK_META[book.title] : null;
  return {
    detail: book
      ? (meta?.authors ?? "Autor no declarado") + " · " + book.title + " · " + reference + (meta ? " · " + meta.publisher : "")
      : reference,
  };
}

/** Creates stable reading-order footnote numbers for theory and production gotchas. */
export function buildCitationIndex(texts: string[], books: BookRef[]): CitationIndex {
  const index: CitationIndex = new Map();
  for (const text of texts) {
    for (const match of text.matchAll(CITATION)) {
      for (const reference of match[1]!.split(";").map((part) => part.trim())) {
        if (index.has(reference)) continue;
        index.set(reference, { number: index.size + 1, reference, detail: citationParts(reference, books).detail });
      }
    }
  }
  return index;
}

/** Renders numeric citations; hover or keyboard focus exposes the full locator. */
export function withCitations(text: string, books: BookRef[], index: CitationIndex, keyPrefix = "c"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(CITATION)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const records = match[1]!.split(";").map((part) => part.trim()).map((reference) => {
      return index.get(reference) ?? {
        number: index.size + 1,
        reference,
        detail: citationParts(reference, books).detail,
      };
    });
    const tooltip = records.map((record) => "[" + record.number + "] " + record.detail).join("\n");
    out.push(
      <cite key={keyPrefix + "-" + match.index} className="cite" tabIndex={0} aria-label={tooltip} data-tooltip={tooltip}>
        [{records.map((record) => record.number).join(",")}]
      </cite>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function mapCitations(children: ReactNode, books: BookRef[], index: CitationIndex): ReactNode {
  if (typeof children === "string") return withCitations(children, books, index);
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === "string" ? <span key={i}>{withCitations(child, books, index, "c" + i)}</span> : child,
    );
  }
  return children;
}
