"use client";

import { ChevronLeft, ChevronRight, CornerDownRight } from "lucide-react";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/hallmark/CopyButton";
import { highlightBash, type Tok } from "@/lib/highlight";
import type { Lab } from "@/lib/types";

type Block = { step: number; kind: "script" | "cmd" | "expect" | "note"; lines: string[]; copy: string | null };

function sessionBlocks(lab: Lab): Block[] {
  const blocks: Block[] = [
    { step: 0, kind: "note", lines: [`# setup · ${lab.id}`], copy: null },
    { step: 0, kind: "script", lines: lab.setup.value.split("\n"), copy: lab.setup.value },
  ];
  for (const s of lab.walkthrough) {
    const step = s.index + 1;
    blocks.push({ step, kind: "note", lines: [`# paso ${step}`], copy: null });
    for (const c of s.commands) blocks.push({ step, kind: "cmd", lines: [c.text], copy: c.text });
    for (const c of s.code) blocks.push({ step, kind: "cmd", lines: c.value.split("\n"), copy: c.value });
    if (s.expectation) blocks.push({ step, kind: "expect", lines: [s.expectation], copy: null });
    if (!s.commands.length && !s.code.length && !s.expectation) {
      blocks.push({ step, kind: "note", lines: ["# sin comando literal: sigue la instrucción del paso"], copy: null });
    }
  }
  return blocks;
}

function Code({ toks }: { toks: Tok[] }) {
  return (
    <>
      {toks.map((t, i) => (
        <span key={i} className={t.cls === "plain" ? undefined : `tok-${t.cls}`}>
          {t.text}
        </span>
      ))}
    </>
  );
}

export function TerminalPanel({ lab }: { lab: Lab }) {
  const [current, setCurrent] = useState(0);
  const blocks = useMemo(() => sessionBlocks(lab), [lab]);
  const total = lab.walkthrough.length;
  let lineNo = 0;

  return (
    <div className="grid gap-xl xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="min-w-0">
        <h2 className="text-lg">Walkthrough</h2>
        <p className="mt-2xs text-sm text-neutral">{lab.environment}</p>
        <ol className="mt-lg grid gap-2xs">
          <li>
            <button
              type="button"
              onClick={() => setCurrent(0)}
              aria-current={current === 0 ? "step" : undefined}
              className="grid w-full grid-cols-[2rem_minmax(0,1fr)] gap-sm rounded-sm border border-transparent p-sm text-left hover:bg-paper-2 aria-[current=step]:border-accent-dim aria-[current=step]:bg-paper-2"
            >
              <span className="font-mono text-sm text-accent">00</span>
              <span className="text-sm text-muted">
                <span className="text-ink">Prepara el entorno.</span> Ejecuta el setup como root; es idempotente y borra
                restos de ejecuciones anteriores.
              </span>
            </button>
          </li>
          {lab.walkthrough.map((s) => (
            <li key={s.index}>
              <button
                type="button"
                onClick={() => setCurrent(s.index + 1)}
                aria-current={current === s.index + 1 ? "step" : undefined}
                className="grid w-full grid-cols-[2rem_minmax(0,1fr)] gap-sm rounded-sm border border-transparent p-sm text-left hover:bg-paper-2 aria-[current=step]:border-accent-dim aria-[current=step]:bg-paper-2"
              >
                <span className="font-mono text-sm text-accent">{String(s.index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 text-sm text-muted">
                  {s.text}
                  {s.expectation && (
                    <span className="mt-xs flex gap-xs text-ink">
                      <CornerDownRight size={15} className="mt-[3px] shrink-0 text-accent" aria-hidden />
                      {s.expectation}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="min-w-0 xl:sticky xl:top-md xl:self-start">
        <div className="console">
          <div className="console-head">
            <span className="font-mono text-xs text-ink">{lab.id}</span>
            <span className="label-mono">
              {current === 0 ? "setup" : `paso ${current} de ${total}`}
            </span>
            <span className="ml-auto flex gap-2xs">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                disabled={current === 0}
                aria-label="Paso anterior"
              >
                <ChevronLeft size={14} aria-hidden />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setCurrent((c) => Math.min(total, c + 1))}
                disabled={current === total}
                aria-label="Paso siguiente"
              >
                <ChevronRight size={14} aria-hidden />
              </button>
              <CopyButton value={lab.setup.value} label="Copiar setup" />
            </span>
          </div>
          <div className="console-body" tabIndex={0} aria-label={`Sesión de consola de ${lab.id}`}>
            {blocks.map((b, bi) =>
              b.lines.map((line, li) => {
                lineNo++;
                const dim = b.step !== current;
                const toks: Tok[] =
                  b.kind === "note"
                    ? [{ text: line, cls: "comment" }]
                    : b.kind === "expect"
                      ? [{ text: `↳ ${line}`, cls: "plain" }]
                      : highlightBash(line);
                return (
                  <div key={`${bi}-${li}`} className="console-line" data-dim={dim} data-current={!dim && b.kind !== "note" && b.kind !== "script"}>
                    <span className="console-gutter">{lineNo}</span>
                    <code className={`console-code ${b.kind === "expect" ? "tok-out" : ""}`}>
                      {b.kind === "cmd" && li === 0 && <span className="tok-prompt">$ </span>}
                      {b.kind === "cmd" && li > 0 && <span className="tok-prompt">{"  "}</span>}
                      <Code toks={toks} />
                    </code>
                    <span className="pl-sm">
                      {b.copy && li === 0 && b.kind === "cmd" && <CopyButton value={b.copy} label={b.lines.length > 1 ? "Copiar bloque" : "Copiar"} />}
                    </span>
                  </div>
                );
              }),
            )}
          </div>
        </div>
        <p className="mt-sm label-mono">Las líneas con ↳ son la salida esperada que declara el laboratorio, no una ejecución real.</p>
      </div>
    </div>
  );
}
