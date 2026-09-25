"use client";

import { useState } from "react";
import { FIELD_DOCS } from "@/lib/packet";
import type { PacketField, PacketTrace } from "@/lib/types";

type Cell = { field: PacketField; row: number; start: number; span: number; cont: boolean };

/** Split fields into 32-bit rows; a field that spills over a row boundary becomes several cells. */
function cells(fields: PacketField[]): Cell[][] {
  const rows: Cell[][] = [];
  for (const f of fields) {
    let bit = f.bitOffset;
    let left = f.bitLength;
    let cont = false;
    while (left > 0) {
      const row = Math.floor(bit / 32);
      const start = bit % 32;
      const span = Math.min(left, 32 - start);
      (rows[row] ??= []).push({ field: f, row, start, span, cont });
      bit += span;
      left -= span;
      cont = true;
    }
  }
  return rows;
}

const byteRange = (f: PacketField) => [Math.floor(f.bitOffset / 8), Math.floor((f.bitOffset + f.bitLength - 1) / 8)] as const;

export function PacketInspector({ trace }: { trace: PacketTrace }) {
  const [capIdx, setCapIdx] = useState(0);
  const cap = trace.captures[capIdx]!;
  const [sel, setSel] = useState<string>(cap.fields.find((f) => f.key === "ip.ttl")?.key ?? cap.fields[0]!.key);
  const field = cap.fields.find((f) => f.key === sel) ?? cap.fields[0]!;
  const [b0, b1] = byteRange(field);
  const changedBytes = new Set(cap.fields.filter((f) => f.changed).flatMap((f) => {
    const [s, e] = byteRange(f);
    return Array.from({ length: e - s + 1 }, (_, k) => s + k);
  }));
  const doc = FIELD_DOCS[field.key];
  const rows = cells(cap.fields);

  return (
    <section aria-labelledby="pkt-title" className="grid gap-lg">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className="min-w-0">
          <h2 id="pkt-title" className="text-lg">
            Inspector de paquete
          </h2>
          <p className="mt-2xs font-mono text-sm break-words text-neutral">{trace.flowLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2xs" role="radiogroup" aria-label="Punto de captura">
          {trace.captures.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={i === capIdx}
              onClick={() => setCapIdx(i)}
              className={`btn btn-xs ${i === capIdx ? "border-accent text-accent" : ""}`}
            >
              <span className="font-mono">{i + 1}</span> {c.label}
            </button>
          ))}
        </div>
      </div>
      <p className="-mt-sm text-sm text-muted">{cap.note}</p>

      <div className="grid gap-lg xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {/* Bit-accurate header diagram, 32 bits per row (hidden on narrow screens in favour of the list). */}
          <div className="hidden md:block">
            <div className="bitgrid mb-2xs label-mono" aria-hidden>
              {[0, 8, 16, 24].map((b) => (
                <span key={b} style={{ gridColumn: `${b + 1} / span 8` }}>
                  {b}
                </span>
              ))}
            </div>
            <div className="grid gap-[2px]" role="listbox" aria-label="Campos de cabecera">
              {rows.map((row, r) => (
                <div key={r} className="bitgrid">
                  {row.map((c) => (
                    <button
                      key={`${c.field.key}-${c.row}`}
                      type="button"
                      role="option"
                      aria-selected={c.field.key === field.key}
                      className="bitcell"
                      data-layer={c.field.header}
                      data-selected={c.field.key === field.key}
                      style={{ gridColumn: `${c.start + 1} / span ${c.span}` }}
                      onClick={() => setSel(c.field.key)}
                      title={`${c.field.label}: ${c.field.value}`}
                    >
                      <span className="truncate text-xs text-neutral">
                        {c.cont ? "…" : c.field.label}
                        {c.field.changed && !c.cont && <span className="text-accent"> ●</span>}
                      </span>
                      {c.span >= 4 && <span className="truncate font-mono text-xs text-ink">{c.cont ? "" : c.field.value}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <ul className="grid gap-2xs md:hidden" aria-label="Campos de cabecera">
            {cap.fields.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => setSel(f.key)}
                  aria-pressed={f.key === field.key}
                  className="bitcell w-full min-h-0 flex-row items-baseline justify-between gap-sm"
                  data-layer={f.header}
                  data-selected={f.key === field.key}
                >
                  <span className="text-xs text-neutral">
                    {f.header} · {f.label}
                    {f.changed && <span className="text-accent"> ●</span>}
                  </span>
                  <span className="truncate font-mono text-xs text-ink">{f.value}</span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-sm flex flex-wrap gap-x-md gap-y-2xs label-mono">
            {(["IPv4", "TCP", "UDP", "DNS"] as const)
              .filter((h) => cap.fields.some((f) => f.header === h))
              .map((h) => (
                <span key={h} className="flex items-center gap-2xs">
                  <span className="bitcell inline-block size-3 min-h-0 p-0" data-layer={h} aria-hidden />
                  {h}
                </span>
              ))}
            {cap.fields.some((f) => f.changed) && <span><span className="text-accent">●</span> cambió respecto a la captura anterior</span>}
          </p>
        </div>

        <div className="grid min-w-0 content-start gap-md">
          <div className="rounded-md border border-rule bg-paper-2 p-md" aria-live="polite">
            <p className="label-mono">
              {field.header} · bits {field.bitOffset}–{field.bitOffset + field.bitLength - 1} · {field.bitLength} bit
              {field.bitLength === 1 ? "" : "s"}
            </p>
            <h3 className="mt-2xs text-md">{field.label}</h3>
            <p className="mt-2xs font-mono text-md text-accent">{field.value}</p>
            {field.changed && <p className="mt-xs text-sm text-accent">Cambió en este salto.</p>}
            {doc && <p className="mt-sm text-sm text-muted">{doc.what}</p>}
            {doc?.security && <p className="mt-xs border-l-2 border-deny pl-sm text-sm text-ink">{doc.security}</p>}
          </div>

          <div className="overflow-x-auto rounded-md border border-rule bg-paper-0 p-sm">
            <p className="label-mono mb-xs">{cap.bytes.length} bytes · hex</p>
            <div className="grid w-max grid-cols-[3rem_repeat(8,1.6rem)] font-mono text-xs leading-6" role="presentation">
              {Array.from({ length: Math.ceil(cap.bytes.length / 8) }, (_, r) => (
                <div key={r} className="contents">
                  <span className="text-rule-strong tabular-nums">{(r * 8).toString(16).padStart(4, "0")}</span>
                  {cap.bytes.slice(r * 8, r * 8 + 8).map((byte, k) => {
                    const i = r * 8 + k;
                    const on = i >= b0 && i <= b1;
                    return (
                      <button
                        key={i}
                        type="button"
                        tabIndex={-1}
                        className="hexbyte rounded-sm text-center text-muted"
                        data-selected={on}
                        data-changed={changedBytes.has(i)}
                        onClick={() => {
                          const f = cap.fields.find((x) => {
                            const [s, e] = byteRange(x);
                            return i >= s && i <= e;
                          });
                          if (f) setSel(f.key);
                        }}
                      >
                        {byte.toString(16).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <details className="text-sm text-neutral">
        <summary className="cursor-pointer label-mono">Supuestos de la síntesis</summary>
        <ul className="mt-xs grid list-disc gap-2xs pl-lg">
          {trace.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
