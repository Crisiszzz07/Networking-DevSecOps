"use client";

import Link from "next/link";
import { useSeen } from "@/lib/progress";
import type { Sky } from "@/lib/sky";

/** The module's own constellation, drawn small in the module header; seen stars are lit. */
export function MiniConstellation({ sky, moduleId }: { sky: Sky; moduleId: string }) {
  const seen = useSeen();
  const i = sky.modules.findIndex((m) => m.id === moduleId);
  const mod = sky.modules[i];
  if (!mod) return null;
  const stars = sky.concepts.filter((c) => c.home === moduleId);
  const pts = [mod.pos.wide, ...stars.map((c) => c.pos.wide)];
  const pad = 40;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const w = Math.max(...pts.map((p) => p.x)) + pad - minX;
  const h = Math.max(...pts.map((p) => p.y)) + pad - minY;
  const at = (id: string) => (id === moduleId ? mod.pos.wide : stars.find((c) => c.id === id)!.pos.wide);
  const lit = stars.filter((c) => seen.includes(c.id)).length;

  return (
    <Link href={`/?estrella=${moduleId}`} className="group grid justify-items-center gap-sm" aria-label={`Ver la subred M${mod.num} en el cielo: ${lit} de ${stars.length} hosts en línea`}>
      <span className="mini-plate">
      <svg viewBox={`${minX} ${minY} ${w} ${h}`} className="mini-sky" aria-hidden>
        <defs>
          <radialGradient id="mini-bloom">
            <stop offset="0%" style={{ stopColor: "var(--color-const-hot)", stopOpacity: 0.9 }} />
            <stop offset="25%" style={{ stopColor: "var(--color-const)", stopOpacity: 0.35 }} />
            <stop offset="100%" style={{ stopColor: "var(--color-const-deep)", stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        {sky.edges
          .filter((e) => e.kind === "figure" && e.module === moduleId)
          .map((e, n) => {
            const a = at(e.a);
            const b = at(e.b);
            return (
              <path
                key={n}
                className="sky-figure"
                data-state="on"
                pathLength={1}
                d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                style={{ animationDelay: `${n * 70}ms` }}
              />
            );
          })}
        <circle cx={mod.pos.wide.x} cy={mod.pos.wide.y} r={110} fill="url(#mini-bloom)" />
        <circle cx={mod.pos.wide.x} cy={mod.pos.wide.y} r={16} style={{ fill: "var(--color-star)" }} />
        {stars.map((c) => {
          const on = seen.includes(c.id);
          return (
            <g key={c.id}>
              {on && <circle cx={c.pos.wide.x} cy={c.pos.wide.y} r={34} fill="url(#mini-bloom)" />}
              <circle cx={c.pos.wide.x} cy={c.pos.wide.y} r={on ? 9 : 7} style={{ fill: on ? "var(--color-const-hot)" : "var(--color-star-dim)" }} />
            </g>
          );
        })}
      </svg>
      </span>
      <span className="label-mono group-hover:text-ink">
        subred M{mod.num} · {lit}/{stars.length} hosts en línea · ver en el cielo →
      </span>
    </Link>
  );
}
