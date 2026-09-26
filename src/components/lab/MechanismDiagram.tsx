"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CircleAlert, LoaderCircle } from "lucide-react";
import { mechanismFor } from "@/lib/mechanisms";

type DiagramState = "ready" | "loading" | "error";

/**
 * A figure from the theory. When a curated diagram exists for it (see
 * lib/mechanisms.ts) it becomes an interactive flow with the original figure
 * folded underneath; otherwise the original figure is shown as-is. Nothing in
 * the source is ever hidden, and no generic diagram stands in for a missing one.
 */
export function MechanismDiagram({
  source,
  state = "ready",
  disabled = false,
}: {
  source: string;
  state?: DiagramState;
  disabled?: boolean;
}) {
  const diagram = useMemo(() => mechanismFor(source), [source]);
  const [active, setActive] = useState(0);

  if (state === "loading") {
    return (
      <figure className="mechanism-diagram" data-state="loading" aria-busy="true">
        <figcaption><LoaderCircle size={14} aria-hidden /> Preparando el flujo visual</figcaption>
        <div className="mechanism-skeleton" aria-hidden />
      </figure>
    );
  }
  if (state === "error") {
    return (
      <figure className="mechanism-diagram" data-state="error" role="alert">
        <figcaption><CircleAlert size={14} aria-hidden /> No se pudo representar este mecanismo</figcaption>
        <p>La lectura técnica sigue disponible en el texto del módulo.</p>
      </figure>
    );
  }

  const figure = (
    <pre className="mechanism-source">
      <code>{source.replace(/\n$/, "")}</code>
    </pre>
  );

  if (!diagram) {
    return (
      <figure className="mechanism-diagram" data-state="ready" data-kind="figure">
        <figcaption>
          <span>Figura</span>
        </figcaption>
        {figure}
      </figure>
    );
  }

  const current = diagram.steps[active] ?? diagram.steps[0]!;
  return (
    <figure className="mechanism-diagram" data-state="ready">
      <figcaption>
        <span>Flujo del mecanismo</span>
        <span>{diagram.steps.length} etapas</span>
      </figcaption>
      <div className="mechanism-body">
        <div className="mechanism-intro">
          <h3>{diagram.title}</h3>
          <p>{diagram.cue}</p>
        </div>
        <ol className="mechanism-flow" aria-label={diagram.title}>
          {diagram.steps.map((step, index) => (
            <li key={step.label}>
              <button
                type="button"
                className="mechanism-node"
                aria-pressed={active === index}
                disabled={disabled}
                onClick={() => setActive(index)}
              >
                <span className="mechanism-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="mechanism-label">{step.label}</span>
                <span className="mechanism-signal">{step.signal}</span>
              </button>
              {index < diagram.steps.length - 1 && <ArrowRight className="mechanism-arrow" size={17} aria-hidden />}
            </li>
          ))}
        </ol>
        <div className="mechanism-detail" aria-live="polite">
          <span>{current.signal}</span>
          <p><strong>{current.label}.</strong> {current.detail}</p>
        </div>
        <details className="mechanism-original">
          <summary>Ver la figura original</summary>
          {figure}
        </details>
      </div>
    </figure>
  );
}
