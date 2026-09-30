"use client";

import { BookOpenText, ClipboardCheck, Network, SquareTerminal, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { doneCount, understoodCount, useProgress, useUnderstood } from "@/lib/progress";
import type { LessonRef } from "@/lib/types";

export type QuadrantId = "fundamentos" | "topologia" | "terminal" | "dod";

const QUADS: { id: QuadrantId; title: string; Icon: LucideIcon }[] = [
  { id: "fundamentos", title: "Fundamentos", Icon: BookOpenText },
  { id: "topologia", title: "Topología interactiva", Icon: Network },
  { id: "terminal", title: "Terminal y walkthrough", Icon: SquareTerminal },
  { id: "dod", title: "Auditoría DoD", Icon: ClipboardCheck },
];

/**
 * Four-quadrant switcher. All panels stay in the DOM (pre-rendered, searchable);
 * the hash is updated with replaceState so switching never scroll-jumps.
 * A hash naming a quadrant, or anything inside one (a lesson), opens that quadrant.
 */
export function LabWorkbench({
  moduleId,
  labId,
  checkCount,
  lessons,
  meta,
  panels,
}: {
  moduleId: string;
  labId: string;
  checkCount: number;
  lessons: LessonRef[];
  meta: Record<"topologia" | "terminal", string>;
  panels: Record<QuadrantId, ReactNode>;
}) {
  const [active, setActive] = useState<QuadrantId>("fundamentos");
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const progress = useProgress();
  const done = doneCount(progress[labId], checkCount);
  const read = understoodCount(useUnderstood(), moduleId, lessons);

  useEffect(() => {
    function follow() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      if (QUADS.some((q) => q.id === id)) return setActive(id as QuadrantId);
      const target = document.getElementById(id);
      const panel = target?.closest<HTMLElement>("[role=tabpanel]");
      const quad = panel?.id.replace(/^panel-/, "") as QuadrantId | undefined;
      if (!target || !quad || !QUADS.some((q) => q.id === quad)) return;
      setActive(quad);
      // The panel was hidden: scroll once it is laid out.
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    }
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  function select(id: QuadrantId, focus = false) {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
    if (focus) tabs.current[id]?.focus();
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (dir) {
      e.preventDefault();
      select(QUADS[(i + dir + QUADS.length) % QUADS.length]!.id, true);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      select(QUADS[e.key === "Home" ? 0 : QUADS.length - 1]!.id, true);
    }
  }

  const status: Record<QuadrantId, string> = {
    ...meta,
    fundamentos: `${read}/${lessons.length} lecciones`,
    dod: `${done}/${checkCount} checks`,
  };

  return (
    <div>
      <div role="tablist" aria-label="Cuadrantes del laboratorio" className="grid grid-cols-2 lg:grid-cols-4">
        {QUADS.map((q, i) => (
          <button
            key={q.id}
            ref={(el) => {
              tabs.current[q.id] = el;
            }}
            id={`tab-${q.id}`}
            type="button"
            role="tab"
            aria-selected={active === q.id}
            aria-controls={`panel-${q.id}`}
            tabIndex={active === q.id ? 0 : -1}
            onClick={() => select(q.id)}
            onKeyDown={(e) => onKey(e, i)}
            className="quad-tab -mt-px -ml-px"
          >
            <span className="flex items-center gap-xs">
              <q.Icon size={16} className={active === q.id ? "text-accent" : "text-neutral"} aria-hidden />
              <span className="quad-num">{String(i + 1).padStart(2, "0")}</span>
            </span>
            <span className="quad-title">{q.title}</span>
            <span className="label-mono tabular-nums">{status[q.id]}</span>
          </button>
        ))}
      </div>
      {QUADS.map((q) => (
        <div
          key={q.id}
          id={`panel-${q.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${q.id}`}
          hidden={active !== q.id}
          tabIndex={0}
          className="pt-xl outline-offset-4"
        >
          {panels[q.id]}
        </div>
      ))}
    </div>
  );
}
