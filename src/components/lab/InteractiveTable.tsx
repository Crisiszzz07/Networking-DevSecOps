"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Rows can be pinned (click / Enter) to keep a comparison highlighted while reading. */
export function InteractiveTable({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLTableElement>(null);

  useEffect(() => {
    ref.current?.querySelectorAll("tbody tr").forEach((tr) => {
      tr.setAttribute("tabindex", "0");
      tr.setAttribute("aria-selected", "false");
    });
  }, []);

  function toggle(target: EventTarget | null) {
    const tr = (target as HTMLElement | null)?.closest("tbody tr");
    if (!tr) return;
    const pinned = tr.getAttribute("data-pinned") === "true";
    tr.setAttribute("data-pinned", String(!pinned));
    tr.setAttribute("aria-selected", String(!pinned));
  }

  return (
    <div className="overflow-x-auto">
      <table
        ref={ref}
        className="data-table"
        onClick={(e) => toggle(e.target)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(e.target);
          }
        }}
      >
        {children}
      </table>
      <p className="mt-2xs label-mono">Pulsa una fila para fijarla.</p>
    </div>
  );
}
