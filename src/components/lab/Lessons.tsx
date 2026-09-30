"use client";

import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { lessonAnchor } from "@/lib/lessons";
import { doneCount, firstPending, isUnderstood, setUnderstood, understoodCount, useProgress, useUnderstood } from "@/lib/progress";
import type { LessonKind, LessonRef } from "@/lib/types";

// Comprehension progress: every counted `##` section of the theory ends with an
// honest "I understand this" mark. It is self-reported by design; the DoD audit
// remains the verified half of the module.

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

/** Closes a lesson: mark it understood and move on, or undo an earlier mark. */
export function LessonCheck({
  moduleId,
  lesson,
  next,
}: {
  moduleId: string;
  lesson: LessonRef;
  /** Next counted lesson, or null when this is the last one (the checkpoint follows). */
  next: LessonRef | null;
}) {
  const understood = useUnderstood();
  const at = understood[moduleId]?.[lesson.id];
  const target = next ? lessonAnchor(next.id) : "checkpoint";

  if (at) {
    return (
      <footer className="lesson-check" data-done>
        <p className="lesson-check-state">
          <Check size={16} aria-hidden />
          Entendida · {dateFmt.format(new Date(at))}
        </p>
        <div className="lesson-check-actions">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => scrollToId(target)}>
            {next ? `Siguiente: ${next.title}` : "Ir al checkpoint"}
            <ArrowDown size={14} aria-hidden />
          </button>
          <button type="button" className="lesson-undo" onClick={() => setUnderstood(moduleId, lesson.id, false)}>
            Desmarcar
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="lesson-check">
      <div className="min-w-0">
        <p className="lesson-check-q">¿La entiendes?</p>
        <p className="mt-2xs text-sm text-muted">
          Márcala sólo si puedes explicarla con tus palabras y decir por qué importa en producción.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setUnderstood(moduleId, lesson.id, true);
          // The footer shrinks once marked: React commits that before this timer runs.
          setTimeout(() => scrollToId(target), 0);
        }}
      >
        Lo entiendo{next ? " · siguiente" : " · al checkpoint"}
        <ArrowDown size={15} aria-hidden />
      </button>
    </footer>
  );
}

type NavItem = { id: string; title: string; kind: LessonKind; minutes: number };

const KIND_LABEL: Record<Exclude<LessonKind, "leccion">, string> = { orientacion: "guía", referencia: "consulta" };

/** Reading map in the rail: where you are, what you understood, what is optional. */
export function LessonNav({ moduleId, items }: { moduleId: string; items: NavItem[] }) {
  const understood = useUnderstood();
  const [active, setActive] = useState<string | null>(null);
  const counted = items.filter((i) => i.kind === "leccion");
  const done = understoodCount(understood, moduleId, counted);

  useEffect(() => {
    const sections = items.map((i) => document.getElementById(lessonAnchor(i.id))).filter((el): el is HTMLElement => el !== null);
    // The section crossing the upper third of the viewport is the one being read.
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-30% 0px -65% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items]);

  let n = 0;
  return (
    <nav aria-label="Lecciones de este módulo">
      <div className="flex items-baseline justify-between gap-sm">
        <p className="rail-label">Lecciones</p>
        <p className="label-mono tabular-nums">
          {done}/{counted.length} entendidas
        </p>
      </div>
      <div className="meter mt-2xs">
        <span style={{ transform: `scaleX(${counted.length ? done / counted.length : 0})` }} />
      </div>
      <ol className="reading-nav">
        {items.map((item) => {
          const counts = item.kind === "leccion";
          const num = counts ? String(++n).padStart(2, "0") : "·";
          const ok = counts && isUnderstood(understood, moduleId, item.id);
          const anchor = lessonAnchor(item.id);
          return (
            <li key={item.id}>
              <a
                href={"#" + anchor}
                data-kind={item.kind}
                data-done={ok}
                aria-current={active === anchor ? "location" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId(anchor);
                }}
              >
                <span aria-hidden>{ok ? <Check size={13} /> : num}</span>
                <span className="reading-nav-title">
                  {item.title}
                  <span className="reading-nav-meta">
                    {item.kind === "leccion" ? `${item.minutes} min` : KIND_LABEL[item.kind]}
                    {ok && <span className="sr-only"> · entendida</span>}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Header summary: the two halves of a module and where to pick it up. */
export function ModuleProgress({
  moduleId,
  labId,
  checkCount,
  lessons,
}: {
  moduleId: string;
  labId: string;
  checkCount: number;
  lessons: LessonRef[];
}) {
  const understood = useUnderstood();
  const progress = useProgress();
  const read = understoodCount(understood, moduleId, lessons);
  const checks = doneCount(progress[labId], checkCount);
  const pending = firstPending(understood, moduleId, lessons);
  const minutesLeft = lessons.filter((l) => !isUnderstood(understood, moduleId, l.id)).reduce((a, l) => a + l.minutes, 0);

  const resume = pending
    ? { href: "#" + lessonAnchor(pending.id), label: read ? `Retomar: ${pending.title}` : `Empezar: ${pending.title}` }
    : checks < checkCount
      ? { href: "#dod", label: "Lecciones entendidas · sigue con la Auditoría DoD" }
      : null;

  return (
    <div className="module-progress">
      <div>
        <div className="flex justify-between gap-sm label-mono">
          <span>Comprensión</span>
          <span className="tabular-nums">
            {read}/{lessons.length} lecciones
          </span>
        </div>
        <div className="meter mt-2xs">
          <span style={{ transform: `scaleX(${lessons.length ? read / lessons.length : 0})` }} />
        </div>
      </div>
      <div>
        <div className="flex justify-between gap-sm label-mono">
          <span>Práctica verificada</span>
          <span className="tabular-nums">
            {checks}/{checkCount} checks
          </span>
        </div>
        <div className="meter meter-allow mt-2xs">
          <span style={{ transform: `scaleX(${checkCount ? checks / checkCount : 0})` }} />
        </div>
      </div>
      {resume ? (
        <a href={resume.href} className="module-resume">
          <span className="min-w-0">{resume.label}</span>
          {pending && <span className="label-mono whitespace-nowrap">~{minutesLeft} min</span>}
          <ArrowRight size={14} aria-hidden />
        </a>
      ) : (
        <p className="module-resume" data-done>
          <Check size={14} aria-hidden /> Módulo completo: entendido y verificado
        </p>
      )}
    </div>
  );
}
