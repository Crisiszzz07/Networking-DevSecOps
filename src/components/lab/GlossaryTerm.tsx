"use client";

import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { markSeen, useSeen } from "@/lib/progress";

export type GlossaryCard = { id: string; term: string; short: string; analogy: string; why: string };

/** A term in the theory that opens its plain-language explanation right where you are reading. */
export function GlossaryTerm({ entry, children }: { entry: GlossaryCard; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const seen = useSeen().includes(entry.id);
  return (
    <>
      <button
        type="button"
        className="gloss-term"
        data-seen={seen}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          markSeen(entry.id);
        }}
      >
        {children}
      </button>
      {open && (
        <span className="gloss-card" role="note">
          <span className="flex items-start justify-between gap-sm">
            <span className="font-display text-md text-ink">{entry.term}</span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(false)} aria-label="Cerrar explicación">
              <X size={13} aria-hidden />
            </button>
          </span>
          <span className="mt-2xs block text-ink">{entry.short}</span>
          <span className="mt-xs block text-accent">≈ {entry.analogy}</span>
          <span className="mt-xs block text-neutral">{entry.why}</span>
        </span>
      )}
    </>
  );
}

/** Chip row version, for the "conceptos de este módulo" strip. */
export function GlossaryChips({ entries }: { entries: GlossaryCard[] }) {
  const seen = useSeen();
  const [open, setOpen] = useState<string | null>(null);
  const card = entries.find((e) => e.id === open);
  return (
    <div>
      <ul className="flex flex-wrap gap-xs">
        {entries.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="star-chip"
              data-seen={seen.includes(e.id)}
              aria-expanded={open === e.id}
              onClick={() => {
                setOpen(open === e.id ? null : e.id);
                markSeen(e.id);
              }}
            >
              <span className="chip-node" aria-hidden />
              {e.term}
            </button>
          </li>
        ))}
      </ul>
      {card && (
        <div className="gloss-card max-w-[60ch]" role="note">
          <span className="font-display text-md text-ink">{card.term}</span>
          <span className="mt-2xs block text-ink">{card.short}</span>
          <span className="mt-xs block text-accent">≈ {card.analogy}</span>
          <span className="mt-xs block text-neutral">{card.why}</span>
        </div>
      )}
    </div>
  );
}
