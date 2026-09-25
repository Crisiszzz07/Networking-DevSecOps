"use client";

import { Check, RotateCcw, ScanSearch, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { DecisionCheckpointSpec } from "@/lib/checkpoints";

const STORAGE_KEY = "lnet:decision-checkpoints:v1";

function completedIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : [];
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function remember(id: string) {
  try {
    const current = completedIds();
    if (!current.includes(id)) window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, id]));
  } catch {
    /* A blocked store must not prevent learning in the current session. */
  }
}

export function DecisionCheckpoint({ checkpoint, source }: { checkpoint: DecisionCheckpointSpec; source: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wasCompleted, setWasCompleted] = useState(false);
  const selected = checkpoint.options.find((option) => option.id === selectedId) ?? null;
  useEffect(() => {
    setWasCompleted(completedIds().includes(checkpoint.id));
  }, [checkpoint.id]);

  function answer(optionId: string) {
    const option = checkpoint.options.find((candidate) => candidate.id === optionId);
    if (!option || selectedId) return;
    setSelectedId(optionId);
    if (option.correct) {
      remember(checkpoint.id);
      setWasCompleted(true);
    }
  }

  function retry() {
    setSelectedId(null);
  }

  return (
    <section className="decision-checkpoint" aria-labelledby={checkpoint.id + "-title"}>
      <header className="decision-head">
        <div>
          <p className="reading-kicker">{checkpoint.eyebrow}</p>
          <h2 id={checkpoint.id + "-title"}>{checkpoint.title}</h2>
        </div>
        {wasCompleted && (
          <span className="checkpoint-status">
            <Check size={14} aria-hidden /> Dominado
          </span>
        )}
      </header>

      <div className="decision-scenario">
        <p>{checkpoint.prompt}</p>
        <pre aria-label="Observación de tcpdump">{checkpoint.observation.join("\n")}</pre>
      </div>

      <fieldset className="decision-options">
        <legend>{checkpoint.question}</legend>
        <div>
          {checkpoint.options.map((option, index) => {
            const isSelected = selectedId === option.id;
            const state = selected
              ? option.correct
                ? "is-correct"
                : isSelected
                  ? "is-incorrect"
                  : ""
              : "";
            return (
              <button
                key={option.id}
                type="button"
                disabled={selectedId !== null}
                aria-describedby={isSelected ? checkpoint.id + "-feedback" : undefined}
                className={"decision-option " + state}
                onClick={() => answer(option.id)}
              >
                <span>{String.fromCharCode(65 + index)}</span>
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {selected && (
        <div
          id={checkpoint.id + "-feedback"}
          className={"decision-feedback " + (selected.correct ? "is-correct" : "is-incorrect")}
          aria-live="polite"
        >
          <div className="decision-feedback-title">
            {selected.correct ? <Check size={17} aria-hidden /> : <X size={17} aria-hidden />}
            <strong>{selected.correct ? "Hipótesis defendible" : "Hipótesis descartada"}</strong>
          </div>
          <p>{selected.feedback}</p>
          <div className="decision-evidence">
            <p>
              <ScanSearch size={15} aria-hidden /> Evidencia que reduce la incertidumbre
            </p>
            <ol>
              {checkpoint.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          <p className="decision-takeaway">{checkpoint.takeaway}</p>
          <p className="decision-source">{source}</p>
          <button type="button" className="btn btn-ghost btn-xs" onClick={retry}>
            <RotateCcw size={14} aria-hidden /> Intentar de nuevo
          </button>
        </div>
      )}
    </section>
  );
}
