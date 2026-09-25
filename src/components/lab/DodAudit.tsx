"use client";

import { RotateCcw, ScanSearch } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/hallmark/CopyButton";
import { StatusGlyph, type Status } from "@/components/hallmark/StatusGlyph";
import { instrumentDod, parseRunOutput } from "@/lib/dod";
import { highlightBash } from "@/lib/highlight";
import { doneCount, restoreLab, updateLab, useProgress, type LabProgress } from "@/lib/progress";
import type { DodSpec } from "@/lib/types";

export function DodAudit({ labId, dod }: { labId: string; dod: DodSpec }) {
  const progress = useProgress();
  const lab = progress[labId];
  const [output, setOutput] = useState("");
  const [summary, setSummary] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [undo, setUndo] = useState<LabProgress | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const instrumented = useMemo(() => instrumentDod(dod, labId), [dod, labId]);
  const checks = dod.lines.filter((l) => l.kind === "check");
  const done = doneCount(lab, dod.checkCount);

  function analyse() {
    const run = parseRunOutput(output, dod, labId);
    const any = run.statuses.some((s) => s !== "pending");
    setSummary({ text: run.summary, tone: any && !run.statuses.includes("fail") ? "ok" : "warn" });
    if (!any) return;
    updateLab(labId, (prev) => {
      const next = { ...prev.checks };
      run.statuses.forEach((s, i) => {
        if (s !== "pending") next[i] = s;
      });
      return { ...prev, checks: next, source: run.source };
    });
  }

  function toggleManual(i: number) {
    updateLab(labId, (prev) => ({ ...prev, manual: { ...prev.manual, [i]: !prev.manual[i] } }));
  }

  function reset() {
    setUndo(lab ?? null);
    restoreLab(labId, undefined);
    setSummary(null);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function statusOf(i: number): Status {
    const verified = lab?.checks[i];
    if (verified === "pass") return "pass";
    if (lab?.manual[i]) return "manual";
    if (verified === "fail") return "fail";
    return "pending";
  }

  return (
    <div className="grid gap-2xl xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section aria-labelledby="dod-checks" className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div>
            <h2 id="dod-checks" className="text-lg">
              Definición de Terminado
            </h2>
            <p className="mt-2xs text-sm text-neutral">
              El laboratorio está cerrado cuando los {dod.checkCount} checks pasan y el script imprime{" "}
              <code className="font-mono text-ink">{dod.passToken}</code>.
            </p>
          </div>
          <p className="font-display text-xl tabular-nums" aria-label={`${done} de ${dod.checkCount} checks`}>
            {done}
            <span className="text-neutral">/{dod.checkCount}</span>
          </p>
        </div>

        <ol className="mt-lg grid gap-sm">
          {checks.map((c) => {
            const i = c.check!;
            const status = statusOf(i);
            return (
              <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-sm gap-y-xs rounded-md border border-rule bg-paper-2 p-md">
                <StatusGlyph status={status} />
                <div className="min-w-0">
                  <code className="block overflow-x-auto pb-2xs font-mono text-sm whitespace-pre">
                    {highlightBash(c.source).map((t, k) => (
                      <span key={k} className={t.cls === "plain" ? undefined : `tok-${t.cls}`}>
                        {t.text}
                      </span>
                    ))}
                  </code>
                  {c.describe && <p className="mt-2xs text-sm text-muted">Comprueba que {c.describe}.</p>}
                  <div className="mt-sm flex flex-wrap items-center gap-xs">
                    <label className="flex cursor-pointer items-center gap-xs text-sm text-muted">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-accent)]"
                        checked={Boolean(lab?.manual[i])}
                        onChange={() => toggleManual(i)}
                      />
                      Lo verifiqué a mano
                    </label>
                    {lab?.checks[i] && (
                      <span className="label-mono">
                        · último análisis: {lab.checks[i] === "pass" ? "pasa" : "falla"}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-md flex flex-wrap items-center gap-sm" aria-live="polite">
          {lab && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={reset}>
              <RotateCcw size={13} aria-hidden />
              Borrar progreso de este lab
            </button>
          )}
          {undo && (
            <span className="flex items-center gap-xs text-sm text-muted">
              Progreso borrado.
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => {
                  restoreLab(labId, undo);
                  setUndo(null);
                }}
              >
                Deshacer
              </button>
            </span>
          )}
        </div>
      </section>

      <section aria-labelledby="dod-run" className="min-w-0">
        <details className="local-verification">
          <summary>
            <span>¿Vas a practicar en Linux? Verifica tu entorno</span>
            <span>Opcional</span>
          </summary>
          <p>
            Usa esta ruta sólo después de preparar el laboratorio en tu propia máquina. No hace falta instalar ni
            ejecutar nada para leer, explorar o completar los checkpoints.
          </p>
          <ol>
            <li>
              <code>pnpm verifier:build</code>
              <CopyButton value="pnpm verifier:build" />
            </li>
            <li>
              <code>sudo ./bin/lnverify run {labId} --json</code>
              <CopyButton value={`sudo ./bin/lnverify run ${labId} --json`} />
            </li>
          </ol>
        </details>

        <h2 id="dod-run" className="mt-xl text-lg">
          Carga tu verificación
        </h2>
        <ol className="mt-md grid gap-md text-sm text-muted">
          <li>
            <span className="text-ink">Ejecuta el script instrumentado.</span> Evalúa cada check por separado y escribe
            una línea <code className="font-mono text-ink">::lnet</code> por check, en vez de abortar en el primero.
            <div className="mt-xs flex flex-wrap gap-xs">
              <CopyButton value={instrumented} label="Copiar instrumentado" />
              <CopyButton value={dod.script} label="Copiar original" />
            </div>
          </li>
          <li>
            <span className="text-ink">O usa el verificador en Go</span>, que produce los mismos marcadores o JSON:
            <div className="mt-xs flex items-center justify-between gap-sm rounded-sm border border-rule bg-paper-0 py-2xs pr-2xs pl-sm">
              <code className="min-w-0 overflow-x-auto font-mono whitespace-nowrap text-ink">sudo ./bin/lnverify run {labId}</code>
              <CopyButton value={`sudo ./bin/lnverify run ${labId}`} />
            </div>
          </li>
          <li>
            <span className="text-ink">Pega la salida aquí.</span> También vale la salida del script original (
            <code className="font-mono">{dod.passToken}</code>) o una traza de <code className="font-mono">bash -x</code>.
          </li>
        </ol>
        <label htmlFor={`out-${labId}`} className="sr-only">
          Salida de la verificación
        </label>
        <textarea
          id={`out-${labId}`}
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={`::lnet ${labId} check 0 pass`}
          className="mt-md block w-full resize-y rounded-md border border-rule-strong bg-paper-0 p-sm font-mono text-sm text-ink placeholder:text-neutral focus-visible:border-accent"
        />
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <button type="button" className="btn btn-primary" onClick={analyse} disabled={!output.trim()}>
            <ScanSearch size={16} aria-hidden />
            Analizar salida
          </button>
          {output && (
            <button type="button" className="btn btn-ghost" onClick={() => setOutput("")}>
              Limpiar
            </button>
          )}
        </div>
        <p
          className={`mt-sm min-h-6 text-sm ${summary?.tone === "warn" ? "text-deny" : "text-allow"}`}
          role="status"
        >
          {summary?.text}
        </p>
      </section>
    </div>
  );
}
