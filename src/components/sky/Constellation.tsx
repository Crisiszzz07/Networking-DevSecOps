"use client";

import { ArrowLeft, ArrowRight, ChevronDown, Dices, Download, Eraser, Globe2, Maximize2, PenLine, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addAsterism, clearAsterisms, removeAsterism, renameAsterism, useAsterisms, type Asterism } from "@/lib/atlas";
import { signatureFor, subnetFor } from "@/lib/names";
import { doneCount, markSeen, useProgress, useSeen } from "@/lib/progress";
import type { Sky, SkyConcept, SkyModule, SkyPoint } from "@/lib/sky";
import { CelestialSphere } from "./CelestialSphere";

type Mode = "wide" | "tall";
type Box = { minX: number; minY: number; maxX: number; maxY: number };
type Viewport = { w: number; h: number; top: number; right: number };

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function wrap(title: string, max = 24): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of title.split(" ")) {
    if ((cur + " " + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function arc(r: number, frac: number) {
  const c = 2 * Math.PI * r;
  return { strokeDasharray: `${c * frac} ${c}` };
}

/** A four-pointed diffraction flare centred on (x, y). */
function flare(x: number, y: number, len: number, waist: number) {
  return (
    `M ${x - len} ${y} L ${x} ${y - waist} L ${x + len} ${y} L ${x} ${y + waist} Z ` +
    `M ${x} ${y - len} L ${x + waist} ${y} L ${x} ${y + len} L ${x - waist} ${y} Z`
  );
}

/** The same flare turned 45°. */
function flareDiag(x: number, y: number, len: number, waist: number) {
  const l = len / Math.SQRT2;
  const w = waist / Math.SQRT2;
  return (
    `M ${x - l} ${y - l} L ${x + w} ${y - w} L ${x + l} ${y + l} L ${x - w} ${y + w} Z ` +
    `M ${x + l} ${y - l} L ${x + w} ${y + w} L ${x - l} ${y + l} L ${x - w} ${y - w} Z`
  );
}


type Draft = { stars: string[]; edges: [string, string][] };
const NO_DRAFT: Draft = { stars: [], edges: [] };
const sameEdge = (e: [string, string], a: string, b: string) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a);

const hueOf = (i: number) => ({ ["--h" as string]: `var(--hue-${(i % 6) + 1})` }) as React.CSSProperties;
const seed = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);

export function Constellation({ sky }: { sky: Sky }) {
  const progress = useProgress();
  const seen = useSeen();
  const [mode, setMode] = useState<Mode>("wide");
  const [focus, setFocus] = useState<string | null>(null);
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverModule, setHoverModule] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [vp, setVp] = useState<Viewport | null>(null);
  const asterisms = useAsterisms();
  const [trace, setTrace] = useState(false);
  const [draft, setDraft] = useState<Draft>(NO_DRAFT);
  const [cursor, setCursor] = useState<SkyPoint | null>(null);
  const [hoverAst, setHoverAst] = useState<string | null>(null);
  const [born, setBorn] = useState<Asterism | null>(null);
  const [grid, setGrid] = useState(false);
  const [indexOpen, setIndexOpen] = useState(true);
  const [exporting, setExporting] = useState(false);
  const stage = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const hero = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const on = () => setMode(mq.matches ? "wide" : "tall");
    on();
    // On phones the constellation index starts folded: the sky below already shows them.
    if (!mq.matches) setIndexOpen(false);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    try {
      setGrid(window.localStorage.getItem("lnet:grid") === "1");
    } catch {
      /* default off */
    }
  }, []);
  function toggleGrid() {
    setGrid((g) => {
      try {
        window.localStorage.setItem("lnet:grid", g ? "0" : "1");
      } catch {
        /* per-tab only */
      }
      return !g;
    });
  }

  // Deep links: /?estrella=modulo-02 or /?estrella=veth open the sky already focused.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("estrella");
    if (!id) return;
    const c = sky.concepts.find((x) => x.id === id);
    if (c) {
      setFocus(c.home);
      setConceptId(c.id);
    } else if (sky.modules.some((m) => m.id === id)) setFocus(id);
  }, [sky]);

  // The svg works in screen pixels on wide screens so the camera can frame
  // stars into the part of the canvas the floating panel and title leave free.
  useIsoLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const panelBox = panel.current?.getBoundingClientRect();
      const heroBox = hero.current?.getBoundingClientRect();
      const header = parseFloat(getComputedStyle(document.documentElement).fontSize) * 4.5;
      setVp((prev) => {
        const next = {
          w: Math.round(box.width),
          h: Math.round(box.height),
          top: Math.round(heroBox && heroBox.height > 0 ? heroBox.bottom - box.top : (prev?.top ?? header + 40)),
          right: Math.round(panelBox && panelBox.width > 0 ? panelBox.left - box.left : box.width),
        };
        return prev && Object.entries(next).every(([k, v]) => prev[k as keyof Viewport] === v) ? prev : next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (panel.current) ro.observe(panel.current);
    if (hero.current) ro.observe(hero.current);
    return () => ro.disconnect();
  }, [mode, focus === null]);

  const world = sky.size[mode];
  const P = (p: { pos: Record<Mode, SkyPoint> }) => p.pos[mode];
  const byId = useMemo(() => {
    const m = new Map<string, SkyModule | SkyConcept>();
    sky.modules.forEach((x) => m.set(x.id, x));
    sky.concepts.forEach((x) => m.set(x.id, x));
    return m;
  }, [sky]);
  const order = useMemo(() => new Map(sky.modules.map((m, i) => [m.id, i])), [sky]);

  const mod = focus ? sky.modules.find((m) => m.id === focus)! : null;
  const concept = conceptId ? sky.concepts.find((c) => c.id === conceptId)! : null;
  const done = (m: SkyModule) => doneCount(progress[m.labId], m.checkCount);
  const frac = (m: SkyModule) => (m.checkCount ? done(m) / m.checkCount : 0);
  const next = sky.modules.find((m) => done(m) < m.checkCount) ?? null;
  const labsDone = sky.modules.filter((m) => done(m) === m.checkCount).length;
  const litTotal = seen.filter((s) => byId.has(s)).length;

  // Camera: scale s maps world units to screen pixels; k = 1/s keeps labels a constant size.
  const wide = mode === "wide" && vp !== null;
  const cam = useMemo(() => {
    if (!wide || !vp) return { s: vp && mode === "tall" ? vp.w / world.x : 1, tx: 0, ty: 0 };
    const pts = mod ? [P(mod), ...mod.home.map((id) => P(byId.get(id) as SkyConcept))] : [...sky.modules, ...sky.concepts].map(P);
    const box: Box = {
      minX: Math.min(...pts.map((p) => p.x)) - (mod ? 120 : 60),
      maxX: Math.max(...pts.map((p) => p.x)) + (mod ? 120 : 60),
      minY: Math.min(...pts.map((p) => p.y)) - (mod ? 110 : 70),
      maxY: Math.max(...pts.map((p) => p.y)) + (mod ? 150 : 150),
    };
    const pad = 28;
    const free = { x0: pad, x1: Math.max(vp.right - pad, vp.w * 0.45), y0: mod ? 88 : vp.top + 8, y1: vp.h - (mod ? 70 : 92) };
    const s = Math.min((free.x1 - free.x0) / (box.maxX - box.minX), (free.y1 - free.y0) / (box.maxY - box.minY), mod ? 1.35 : 0.95);
    return {
      s,
      tx: (free.x0 + free.x1) / 2 - s * ((box.minX + box.maxX) / 2),
      ty: (free.y0 + free.y1) / 2 - s * ((box.minY + box.maxY) / 2),
    };
  }, [wide, vp, mod, mode, byId, sky]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = 1 / cam.s;
  // On small screens the whole sky is shrunk; stars grow so they stay visible.
  const g = Math.max(1, 0.5 / cam.s);

  function openModule(id: string) {
    if (trace) return addStar(id);
    setAnimated(true);
    setFocus(id);
    setConceptId(null);
  }
  function openConcept(c: SkyConcept) {
    if (trace) return addStar(c.id);
    setAnimated(true);
    setFocus(c.home);
    setConceptId(c.id);
    markSeen(c.id);
  }
  function back() {
    if (trace) {
      if (draft.stars.length) setDraft(NO_DRAFT);
      else setTrace(false);
      return;
    }
    setAnimated(true);
    if (conceptId) setConceptId(null);
    else setFocus(null);
  }
  function closeAll() {
    setAnimated(true);
    setFocus(null);
    setConceptId(null);
  }

  // ─ Drawing your own asterisms ─
  function startTrace() {
    closeAll();
    setBorn(null);
    setDraft(NO_DRAFT);
    setTrace(true);
  }
  function stopTrace() {
    setTrace(false);
    setDraft(NO_DRAFT);
    setCursor(null);
  }
  function finish(d: Draft, closed: boolean) {
    if (d.edges.length === 0) return;
    const a = addAsterism(d.stars, d.edges, closed);
    setBorn(a);
    setDraft(NO_DRAFT);
    setCursor(null);
  }
  function addStar(id: string) {
    setBorn(null);
    const last = draft.stars[draft.stars.length - 1];
    if (!last) return setDraft({ stars: [id], edges: [] });
    if (id === last) return;
    const edges: [string, string][] = draft.edges.some((e) => sameEdge(e, last, id)) ? draft.edges : [...draft.edges, [last, id]];
    // Coming back to the first star closes the shape and names it.
    if (id === draft.stars[0] && draft.stars.length >= 3) return finish({ stars: draft.stars, edges }, true);
    setDraft({ stars: [...draft.stars.filter((s) => s !== id), id], edges });
  }
  function onSkyMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!trace || !draft.stars.length) return;
    const b = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - b.left;
    const sy = e.clientY - b.top;
    setCursor(wide ? { x: (sx - cam.tx) / cam.s, y: (sy - cam.ty) / cam.s } : { x: (sx * world.x) / b.width, y: (sy * world.y) / b.height });
  }
  async function savePng() {
    setExporting(true);
    try {
      const { exportSkyPng } = await import("@/lib/skyExport");
      await exportSkyPng(sky, asterisms, seen, grid);
    } finally {
      setExporting(false);
    }
  }
  function clearSky() {
    if (!asterisms.length && !draft.stars.length) return;
    if (!window.confirm("¿Borrar todas tus rutas? Tu progreso y los hosts en línea no se tocan.")) return;
    clearAsterisms();
    setDraft(NO_DRAFT);
    setBorn(null);
  }

  const act = (fn: () => void) => ({
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      fn();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    },
  });

  const idx = mod ? sky.modules.indexOf(mod) : -1;

  // On phones the sheet covers the lower half: bring the focused constellation into the upper part.
  useEffect(() => {
    if (mode !== "tall" || !focus) return;
    const star = stage.current?.querySelector(`[data-module-id="${focus}"]`);
    if (!star) return;
    const box = star.getBoundingClientRect();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: box.top + box.height / 2 - window.innerHeight * 0.2, behavior: reduce ? "auto" : "smooth" });
  }, [focus, mode]);

  const W = wide ? vp!.w : world.x;
  const H = wide ? vp!.h : world.y;
  const hot = hoverModule ?? focus;
  const astHot = hoverAst ?? born?.id ?? null;
  const centroid = (ids: string[]) => {
    const pts = ids.map((id) => byId.get(id)).filter(Boolean).map((x) => P(x!));
    const cx = pts.reduce((a, p) => a + p.x, 0) / (pts.length || 1);
    const cy = pts.reduce((a, p) => a + p.y, 0) / (pts.length || 1);
    const r = Math.max(60, ...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
    // Labels sit to the right of the figure: module titles live under their stars.
    return { x: cx, y: cy, r, right: Math.max(...pts.map((p) => p.x)) };
  };

  const heroBlock = (
    <div className="sky-hero" ref={hero}>
      <p className="sky-kicker">
        <span className="tok-prompt">$</span> sky map --roadmap devsecops
      </p>
      <h1 className="sky-title">
        Tu cielo <span>de redes</span>
      </h1>
      <p className="sky-prompt">
        {sky.modules.length} subredes · {sky.concepts.length} hosts · {litTotal} en línea
        <span className="cursor" aria-hidden />
      </p>
      <p className="sky-lede">
        Cada constelación es una subred del roadmap: sus estrellas son los conceptos (hosts) y las líneas, los enlaces
        entre ellos. Entender un concepto lo pone en línea; unir los tuyos traza una ruta propia.
      </p>
      <dl className="sky-stats">
        <div>
          <dt>Hosts en línea</dt>
          <dd>
            {litTotal}
            <span>/{sky.concepts.length}</span>
          </dd>
        </div>
        <div>
          <dt>Labs cerrados</dt>
          <dd>
            {labsDone}
            <span>/{sky.modules.length}</span>
          </dd>
        </div>
        <div>
          <dt>Rutas propias</dt>
          <dd>{asterisms.length}</dd>
        </div>
      </dl>
    </div>
  );

  const termOf = (id: string) => {
    const x = byId.get(id);
    return !x ? "?" : "term" in x ? x.term : `M${x.num}`;
  };

  // Esc anywhere leaves the drawing mode (the section handler only sees focused keys).
  useEffect(() => {
    if (!trace) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || stage.current?.contains(document.activeElement)) return;
      if (draft.stars.length) setDraft(NO_DRAFT);
      else stopTrace();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trace, draft.stars.length]);

  // The naming cartouche fades on its own.
  useEffect(() => {
    if (!born) return;
    const t = setTimeout(() => setBorn(null), 6000);
    return () => clearTimeout(t);
  }, [born]);

  const asterismList = asterisms.length > 0 && (
    <section>
      <h2 className="panel-h">Tus rutas</h2>
      <p className="mt-2xs text-sm text-neutral">Pasa por una para verla en el cielo.</p>
      <ul className="mt-sm grid gap-2xs">
        {asterisms.map((a) => (
          <li key={a.id}>
            <div
              className="ast-row"
              data-hot={astHot === a.id}
              onMouseEnter={() => setHoverAst(a.id)}
              onMouseLeave={() => setHoverAst(null)}
              onFocus={() => setHoverAst(a.id)}
              onBlur={() => setHoverAst(null)}
            >
              <span className="ast-glyph" aria-hidden>
                ⌁
              </span>
              <span className="min-w-0">
                <span className="ast-row-name">{a.name}</span>
                <span className="ast-row-tag">
                  {a.asn} · {a.stars.length} hosts · {a.edges.length} enlaces
                </span>
                <span className="ast-row-terms">{a.stars.map(termOf).join(" — ")}</span>
              </span>
              <span className="flex gap-3xs">
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => renameAsterism(a.id)} aria-label={`Otro nombre en clave para ${a.name}`} title="Otro nombre en clave">
                  <Dices size={13} aria-hidden />
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => removeAsterism(a.id)} aria-label={`Borrar ${a.name}`} title="Borrar">
                  <Trash2 size={13} aria-hidden />
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  const tracePanel = (
    <div className="grid gap-lg">
      <div>
        <h2 className="panel-title">Traza tu ruta</h2>
        <p className="panel-sig">tu propio asterismo, anunciado como un AS privado</p>
      </div>
      <p className="text-muted">
        Une estrellas que para ti estén relacionadas, por ejemplo <span className="text-ink">veth</span> →{" "}
        <span className="text-ink">netns</span> → <span className="text-ink">bridge</span>. Explicarte por qué van juntas es
        la mejor forma de fijarlas. Al cerrar el anillo (o pulsar «Anunciar») recibe un nombre en clave y un número de AS
        privado (64512–65534), como los que usa BGP dentro de una organización.
      </p>
      <ol className="trace-steps">
        <li data-done={draft.stars.length > 0}>Pulsa un host</li>
        <li data-done={draft.edges.length > 0}>Pulsa otro para crear el enlace; sigue la cadena</li>
        <li data-done={false}>Vuelve al primero o pulsa «Anunciar»</li>
      </ol>
      {draft.stars.length > 0 && (
        <p className="label-mono">
          {draft.stars.map(termOf).join(" → ")}
        </p>
      )}
      <div className="flex flex-wrap gap-xs">
        <button type="button" className="btn btn-primary" disabled={draft.edges.length === 0} onClick={() => finish(draft, false)}>
          <Sparkles size={15} aria-hidden />
          Anunciar
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => (draft.stars.length ? setDraft(NO_DRAFT) : stopTrace())}>
          {draft.stars.length ? "Descartar" : "Salir del modo ruta"}
        </button>
      </div>
      {asterismList}
    </div>
  );

  return (
    <section
      ref={stage}
      aria-label="Mapa de constelaciones del roadmap"
      className="sky-stage"
      data-mode={mode}
      data-focus={focus !== null}
      data-trace={trace}
      onKeyDown={(e) => e.key === "Escape" && back()}
    >
      <div className="sky-canvas" ref={canvas}>
        <CelestialSphere grid={grid} dragTarget={canvas} />
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="sky-svg"
          style={mode === "tall" ? { aspectRatio: `${world.x} / ${world.y}` } : undefined}
          onClick={() => focus && back()}
          onPointerMove={onSkyMove}
          onPointerLeave={() => setCursor(null)}
          role="group"
          aria-label="Cielo: estrellas grandes son módulos, pequeñas son conceptos"
        >
          <defs>
            <radialGradient id="g-star">
              <stop offset="0%" style={{ stopColor: "var(--color-star)", stopOpacity: 0.85 }} />
              <stop offset="30%" style={{ stopColor: "var(--color-star)", stopOpacity: 0.18 }} />
              <stop offset="100%" style={{ stopColor: "var(--color-star)", stopOpacity: 0 }} />
            </radialGradient>
            <radialGradient id="g-halo">
              <stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.16 }} />
              <stop offset="70%" style={{ stopColor: "var(--color-accent-dim)", stopOpacity: 0.06 }} />
              <stop offset="100%" style={{ stopColor: "var(--color-accent-dim)", stopOpacity: 0 }} />
            </radialGradient>
            <radialGradient id="g-next">
              <stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.7 }} />
              <stop offset="100%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0 }} />
            </radialGradient>
            {sky.modules.map((m, i) => (
              <g key={m.id} className="hue" style={hueOf(i)}>
                <radialGradient id={`bloom-${i}`}>
                  <stop offset="0%" style={{ stopColor: "var(--color-const-hot)", stopOpacity: 0.95 }} />
                  <stop offset="18%" style={{ stopColor: "var(--color-const)", stopOpacity: 0.55 }} />
                  <stop offset="55%" style={{ stopColor: "var(--color-const-deep)", stopOpacity: 0.12 }} />
                  <stop offset="100%" style={{ stopColor: "var(--color-const-deep)", stopOpacity: 0 }} />
                </radialGradient>
                <radialGradient id={`nebula-${i}`}>
                  <stop offset="0%" style={{ stopColor: "var(--color-const-deep)", stopOpacity: 0.34 }} />
                  <stop offset="60%" style={{ stopColor: "var(--color-const-deep)", stopOpacity: 0.08 }} />
                  <stop offset="100%" style={{ stopColor: "var(--color-const-deep)", stopOpacity: 0 }} />
                </radialGradient>
              </g>
            ))}
          </defs>

          <g className="sky-parallax">
            <g
              className="sky-camera"
              data-animated={animated}
              style={wide ? { transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})` } : undefined}
            >
              {sky.modules.map((m, i) => {
                const p = P(m);
                return (
                  <ellipse
                    key={`neb-${m.id}`}
                    className="sky-nebula"
                    data-state={focus === null ? "idle" : focus === m.id ? "on" : "off"}
                    cx={p.x}
                    cy={p.y}
                    rx={330}
                    ry={250}
                    fill={`url(#nebula-${i})`}
                  />
                );
              })}

              {sky.edges
                .filter((e) => e.kind === "path")
                .map((e, i) => {
                  const a = P(byId.get(e.a) as SkyModule);
                  const b = P(byId.get(e.b) as SkyModule);
                  const lit = frac(byId.get(e.a) as SkyModule) === 1;
                  const d = `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 90} ${b.x} ${b.y}`;
                  return (
                    <g key={`${e.a}-${e.b}`} className="sky-route" data-lit={lit} data-off={focus !== null}>
                      <path className="sky-path" d={d} style={{ strokeWidth: 2.2 * g }} />
                      {[0, 1].map((n) => (
                        <circle key={n} className="sky-packet" r={4.5 * g}>
                          <animateMotion dur={`${5.5 + (i % 3)}s`} begin={`-${n * 2.9 + i * 0.7}s`} repeatCount="indefinite" path={d} />
                        </circle>
                      ))}
                    </g>
                  );
                })}

              {sky.edges
                .filter((e) => e.kind === "echo" && e.module === focus)
                .map((e) => {
                  const a = P(byId.get(e.a) as SkyModule);
                  const b = P(byId.get(e.b) as SkyConcept);
                  return (
                    <line
                      key={`echo-${e.b}`}
                      className="sky-echo hue"
                      style={{ ...hueOf(order.get((byId.get(e.b) as SkyConcept).home)!), strokeWidth: 1.4 * k }}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                    />
                  );
                })}

              {sky.edges
                .filter((e) => e.kind === "figure")
                .map((e, i) => {
                  const a = P(byId.get(e.a)!);
                  const b = P(byId.get(e.b)!);
                  const state = focus === e.module ? "on" : hot === e.module ? "hot" : focus === null ? "idle" : "off";
                  return (
                    <path
                      key={`${e.a}-${e.b}`}
                      className="sky-figure hue"
                      data-state={state}
                      pathLength={1}
                      d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                      style={{ ...hueOf(order.get(e.module)!), animationDelay: `${300 + i * 45}ms`, strokeWidth: (state === "on" ? 2.6 : 1.7) * g }}
                    />
                  );
                })}

              {asterisms.map((a) => {
                const c = centroid(a.stars);
                const state = astHot === a.id ? "hot" : astHot || focus ? "off" : "idle";
                return (
                  <g key={a.id} className="ast" data-state={state} data-born={born?.id === a.id}>
                    <circle className="ast-halo" cx={c.x} cy={c.y} r={c.r + 46 * k} fill="url(#g-halo)" />
                    <circle className="ast-ring" pathLength={100} cx={c.x} cy={c.y} r={c.r + 34 * k} style={{ strokeWidth: 2 * k }} />
                    <circle className="ast-ring-fine" cx={c.x} cy={c.y} r={c.r + 26 * k} style={{ strokeWidth: 0.8 * k }} />
                    {a.edges.map(([p1, p2]) => {
                      const s1 = byId.get(p1);
                      const s2 = byId.get(p2);
                      if (!s1 || !s2) return null;
                      const A = P(s1);
                      const B = P(s2);
                      return <path key={`${p1}-${p2}`} className="ast-line" pathLength={1} d={`M ${A.x} ${A.y} L ${B.x} ${B.y}`} style={{ strokeWidth: 1.6 * g * Math.max(1, k * 0.8) }} />;
                    })}
                    <text className="ast-name" x={c.right + 26 * k} y={c.y - 2 * k} textAnchor="start" style={{ fontSize: 13 * k, strokeWidth: 5 * k }}>
                      {a.name}
                    </text>
                    <text className="ast-tag" x={c.right + 26 * k} y={c.y + 15 * k} textAnchor="start" style={{ fontSize: 11.5 * k, strokeWidth: 5 * k }}>
                      {a.asn} · {a.stars.length} hosts
                    </text>
                  </g>
                );
              })}

              {trace && draft.stars.length > 0 && (
                <g className="ast-draft">
                  {draft.edges.map(([p1, p2]) => {
                    const A = P(byId.get(p1)!);
                    const B = P(byId.get(p2)!);
                    return <line key={`${p1}-${p2}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} style={{ strokeWidth: 1.8 * g * Math.max(1, k * 0.8) }} />;
                  })}
                  {cursor &&
                    (() => {
                      const L = P(byId.get(draft.stars[draft.stars.length - 1]!)!);
                      return <line className="ast-rubber" x1={L.x} y1={L.y} x2={cursor.x} y2={cursor.y} style={{ strokeWidth: 1.2 * k }} />;
                    })()}
                  {draft.stars.map((id, n) => {
                    const A = P(byId.get(id)!);
                    return <circle key={id} className="ast-pick" data-first={n === 0 && draft.stars.length >= 3} cx={A.x} cy={A.y} r={16 * k * Math.max(1, g)} style={{ strokeWidth: 1.4 * k }} />;
                  })}
                </g>
              )}

              {sky.concepts.map((c) => {
                const p = P(c);
                const hi = order.get(c.home)!;
                const isSeen = seen.includes(c.id);
                const on = focus === c.home || (mod?.echoes.includes(c.id) ?? false);
                const showLabel =
                  hover === c.id ||
                  conceptId === c.id ||
                  (focus !== null && on) ||
                  (focus === null && hoverModule === c.home) ||
                  draft.stars.includes(c.id) ||
                  (astHot !== null && (asterisms.find((a) => a.id === astHot)?.stars.includes(c.id) ?? false));
                const r = (4.5 + Math.min(c.magnitude, 8) * 0.45) * g;
                const home = P(byId.get(c.home) as SkyModule);
                const len = Math.hypot(p.x - home.x, p.y - home.y) || 1;
                const ux = (p.x - home.x) / len;
                const uy = (p.y - home.y) / len;
                const gap = r + 9 * k;
                const anchor = ux > 0.35 ? "start" : ux < -0.35 ? "end" : "middle";
                const tw = seed(c.id);
                return (
                  <g
                    key={c.id}
                    className="sky-concept hue"
                    style={hueOf(hi)}
                    data-seen={isSeen}
                    data-selected={conceptId === c.id}
                    data-off={focus !== null && !on}
                    data-picked={draft.stars.includes(c.id)}
                    role="button"
                    tabIndex={focus === null || on ? 0 : -1}
                    aria-label={trace ? `Enlazar ${c.term} a tu ruta` : `Concepto ${c.term}${isSeen ? ", en línea" : ""}`}
                    onMouseEnter={() => setHover(c.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(c.id)}
                    onBlur={() => setHover(null)}
                    {...act(() => openConcept(c))}
                  >
                    <circle cx={p.x} cy={p.y} r={Math.max(28, 16 * k)} fill="transparent" />
                    <g className="star-body" style={{ animationDelay: `${-(tw % 4000)}ms`, animationDuration: `${3 + (tw % 5) * 0.6}s` }}>
                      <circle className="glow" cx={p.x} cy={p.y} r={r * (isSeen ? 9 : 5)} fill={isSeen ? `url(#bloom-${hi})` : "url(#g-star)"} />
                      {isSeen && <path className="sparkle" d={flare(p.x, p.y, r * 4.2, r * 0.55)} />}
                      <circle className="core" cx={p.x} cy={p.y} r={r} />
                    </g>
                    {conceptId === c.id && <circle className="ring" cx={p.x} cy={p.y} r={r + 10 * k} style={{ strokeWidth: 2 * k }} />}
                    {showLabel && (
                      <text
                        className="sky-concept-label"
                        x={p.x + ux * gap}
                        y={p.y + uy * gap + (uy > 0.35 ? 11 * k : uy < -0.35 ? -2 * k : 4.5 * k)}
                        textAnchor={anchor}
                        style={{ fontSize: 13.5 * k, strokeWidth: 4 * k }}
                      >
                        {c.term}
                      </text>
                    )}
                  </g>
                );
              })}

              {sky.modules.map((m, i) => {
                const p = P(m);
                const f = frac(m);
                const lines = wrap(m.title.toUpperCase(), 22);
                const titlePx = focus === m.id ? 15 : 13;
                return (
                  <g
                    key={m.id}
                    className="sky-module hue"
                    style={hueOf(i)}
                    data-module-id={m.id}
                    data-complete={f === 1}
                    data-next={next?.id === m.id}
                    data-off={focus !== null && focus !== m.id}
                    data-focus={focus === m.id}
                    data-hot={hoverModule === m.id}
                    role="button"
                    tabIndex={0}
                    data-picked={draft.stars.includes(m.id)}
                    aria-label={trace ? `Enlazar el módulo ${m.num} a tu ruta` : `Módulo ${m.num}: ${m.title}. ${done(m)} de ${m.checkCount} checks.`}
                    onMouseEnter={() => setHoverModule(m.id)}
                    onMouseLeave={() => setHoverModule(null)}
                    onFocus={() => setHoverModule(m.id)}
                    onBlur={() => setHoverModule(null)}
                    {...act(() => openModule(m.id))}
                  >
                    <circle cx={p.x} cy={p.y} r={46 * g} fill="transparent" />
                    <circle className="bloom" cx={p.x} cy={p.y} r={150 * g} fill={`url(#bloom-${i})`} />
                    <g className="reticle">
                      <circle className="reticle-arcs" pathLength={100} cx={p.x} cy={p.y} r={80 * g} style={{ strokeWidth: 1.6 * g }} />
                      <circle className="reticle-fine" cx={p.x} cy={p.y} r={72 * g} style={{ strokeWidth: 0.8 * g }} />
                      <path
                        className="reticle-ticks"
                        d={`M ${p.x} ${p.y - 88 * g} v ${-12 * g} M ${p.x} ${p.y + 88 * g} v ${12 * g} M ${p.x - 88 * g} ${p.y} h ${-12 * g} M ${p.x + 88 * g} ${p.y} h ${12 * g}`}
                        style={{ strokeWidth: 1.4 * g }}
                      />
                    </g>
                    {next?.id === m.id && <circle className="next-glow" cx={p.x} cy={p.y} r={95 * g} fill="url(#g-next)" />}
                    <path className="spikes" d={flare(p.x, p.y, 88 * g, 3.2 * g)} />
                    <path className="spikes spikes-diag" d={flareDiag(p.x, p.y, 44 * g, 2.2 * g)} />
                    <circle className="orbit" cx={p.x} cy={p.y} r={50 * g} style={{ strokeWidth: 1.6 * g }} />
                    <circle className="track" cx={p.x} cy={p.y} r={34 * g} style={{ strokeWidth: 3 * g }} />
                    {f > 0 && (
                      <circle
                        className="progress"
                        cx={p.x}
                        cy={p.y}
                        r={34 * g}
                        transform={`rotate(-90 ${p.x} ${p.y})`}
                        style={{ ...arc(34 * g, f), strokeWidth: 4.5 * g }}
                      />
                    )}
                    <circle className="rim" cx={p.x} cy={p.y} r={20 * g} />
                    <circle className="core" cx={p.x} cy={p.y} r={12 * g} />
                    {next?.id === m.id && <circle className="beacon" cx={p.x} cy={p.y} r={56 * g} style={{ strokeWidth: 2 * g }} />}
                    <text
                      className="sky-module-num"
                      x={p.x}
                      y={p.y - 62 * g - 6 * k}
                      textAnchor="middle"
                      style={{ fontSize: 12 * k, strokeWidth: 4 * k }}
                    >
                      M{String(i + 1).padStart(2, "0")} · {m.layer}
                    </text>
                    {lines.map((l, n) => (
                      <text
                        key={n}
                        className="sky-module-title"
                        x={p.x}
                        y={p.y + 62 * g + (titlePx + 6) * k + n * (titlePx * 1.45) * k}
                        textAnchor="middle"
                        style={{ fontSize: titlePx * k, strokeWidth: 5 * k }}
                      >
                        {l}
                      </text>
                    ))}
                    <text
                      className="sky-module-cidr"
                      x={p.x}
                      y={p.y + 62 * g + (titlePx + 8) * k + lines.length * (titlePx * 1.45) * k + 3 * k}
                      textAnchor="middle"
                      style={{ fontSize: (titlePx - 1) * k, strokeWidth: 5 * k }}
                    >
                      {subnetFor(i)}
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {mode === "wide" && focus === null && heroBlock}

        {born && (
          <div className="sky-cartouche hud" role="status" key={born.id}>
            <span className="cartouche-kicker">[+] ruta anunciada</span>
            <span className="cartouche-name">{born.name}</span>
            <span className="cartouche-tag">
              {born.asn} · {born.stars.length} hosts · {born.edges.length} enlaces
            </span>
          </div>
        )}

        <div className="sky-hud">
          <div className="sky-tools" role="toolbar" aria-label="Herramientas del cielo">
            {focus ? (
              <button type="button" className="tool" onClick={closeAll}>
                <Maximize2 size={14} aria-hidden />
                <span>Ver todo el cielo</span>
              </button>
            ) : (
              <button type="button" className="tool" aria-pressed={trace} onClick={() => (trace ? stopTrace() : startTrace())}>
                <PenLine size={14} aria-hidden />
                <span>{trace ? "Terminar de trazar" : "Trazar ruta"}</span>
              </button>
            )}
            <button type="button" className="tool" aria-pressed={grid} onClick={toggleGrid} title="Rejilla de coordenadas de la esfera celeste (ascensión recta / declinación)">
              <Globe2 size={14} aria-hidden />
              <span>Coordenadas</span>
            </button>
            <button type="button" className="tool" onClick={savePng} disabled={exporting} title="Descarga tu carta celeste como imagen">
              <Download size={14} aria-hidden />
              <span>{exporting ? "Grabando…" : "Guardar PNG"}</span>
            </button>
            <button type="button" className="tool" onClick={clearSky} disabled={!asterisms.length && !draft.stars.length} title="Borra tus rutas (no toca tu progreso)">
              <Eraser size={14} aria-hidden />
              <span>Limpiar cielo</span>
            </button>
          </div>
          <p className="sky-hint">
            {trace
              ? draft.stars.length === 0
                ? "Pulsa un host (estrella) para empezar la ruta"
                : draft.stars.length >= 3
                  ? "Sigue enlazando · vuelve al primer host para cerrar el anillo · Esc cancela"
                  : "Pulsa otro host para crear el enlace · Esc cancela"
              : focus
                ? "Esc o clic en el cielo vacío para alejarte"
                : "Arrastra el cielo para girarlo · pasa por una estrella grande · pulsa para acercarte"}
          </p>
        </div>
      </div>

      <aside
        ref={panel}
        className={`sky-panel hud${mod ? " hue" : ""}`}
        style={mod ? hueOf(idx) : undefined}
        data-sheet={mode === "tall" && focus !== null}
        aria-live="polite"
      >
        {mode === "tall" && focus !== null && (
          <button type="button" className="btn btn-ghost btn-xs sky-sheet-close" onClick={closeAll} aria-label="Cerrar">
            <X size={15} aria-hidden />
          </button>
        )}
        {trace ? (
          tracePanel
        ) : concept ? (
          <ConceptCard concept={concept} sky={sky} order={order} onModule={openModule} onBack={() => setConceptId(null)} />
        ) : mod ? (
          <div className="grid gap-md">
            <div className="flex items-start justify-between gap-sm">
              <p className="panel-num">
                M{mod.num}
                <span>{mod.layer}</span>
              </p>
              <span className="flex gap-2xs">
                <button type="button" className="btn btn-ghost btn-xs" disabled={idx <= 0} onClick={() => openModule(sky.modules[idx - 1]!.id)} aria-label="Módulo anterior">
                  <ArrowLeft size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={idx >= sky.modules.length - 1}
                  onClick={() => openModule(sky.modules[idx + 1]!.id)}
                  aria-label="Módulo siguiente"
                >
                  <ArrowRight size={14} aria-hidden />
                </button>
              </span>
            </div>
            <div>
              <h2 className="panel-title">{mod.title}</h2>
              <p className="panel-sig">
                <span className="text-signal">{subnetFor(idx)}</span> · {signatureFor(idx)}
              </p>
            </div>
            <p className="text-muted">
              <span className="text-ink">En el laboratorio vas a</span> {mod.objective}
            </p>
            <div>
              <div className="flex justify-between label-mono">
                <span>Definición de Terminado</span>
                <span className="tabular-nums">
                  {done(mod)}/{mod.checkCount}
                </span>
              </div>
              <div className="meter mt-2xs">
                <span style={{ transform: `scaleX(${frac(mod)})` }} />
              </div>
            </div>
            <Link href={`/modules/${mod.slug}/`} className="btn btn-primary btn-lg justify-center">
              Abrir laboratorio
              <ArrowRight size={16} aria-hidden />
            </Link>

            <section>
              <h3 className="panel-h">Hosts de esta subred</h3>
              <p className="mt-2xs text-sm text-neutral">
                {mod.home.filter((id) => seen.includes(id)).length} de {mod.home.length} en línea. Pulsa uno para entenderlo.
              </p>
              <ul className="mt-sm flex flex-wrap gap-xs">
                {mod.home.map((id) => {
                  const c = byId.get(id) as SkyConcept;
                  return (
                    <li key={id}>
                      <button type="button" className="star-chip" data-seen={seen.includes(id)} onClick={() => openConcept(c)}>
                        <Sparkles size={12} aria-hidden />
                        {c.term}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            {mod.echoes.length > 0 && (
              <section>
                <h3 className="panel-h">Tráfico de otras subredes</h3>
                <p className="mt-2xs text-sm text-neutral">
                  Conceptos de otro módulo que aquí reaparecen: los hilos de colores que salen de esta estrella.
                </p>
                <ul className="mt-sm flex flex-wrap gap-xs">
                  {mod.echoes.map((id) => {
                    const c = byId.get(id) as SkyConcept;
                    const hi = order.get(c.home)!;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className="star-chip hue"
                          style={hueOf(hi)}
                          data-echo
                          data-seen={seen.includes(id)}
                          onClick={() => openConcept(c)}
                        >
                          <span className="chip-dot" aria-hidden />
                          {c.term}
                          <span className="text-neutral">M{c.home.slice(-2)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <p className="label-mono">
              Necesitas: {mod.runtime}
              {mod.dependsOn.length > 0 && ` · mejor después de M${mod.dependsOn.map((d) => d.slice(-2)).join(", M")}`}
            </p>
          </div>
        ) : (
          <div className="grid gap-lg">
            {mode === "tall" && heroBlock}
            {next && (
              <button type="button" className="btn btn-primary btn-lg justify-center" onClick={() => openModule(next.id)}>
                Siguiente salto: M{next.num}
                <ArrowRight size={16} aria-hidden />
              </button>
            )}
            <section>
              <button
                type="button"
                className="panel-fold"
                aria-expanded={indexOpen}
                onClick={() => setIndexOpen((o) => !o)}
                disabled={mode === "wide"}
              >
                <span className="panel-h">Subredes · constelaciones</span>
                {mode === "tall" && <ChevronDown size={16} aria-hidden className="fold-icon" />}
              </button>
              {(indexOpen || mode === "wide") && (
                <ul className="mt-sm grid gap-2xs">
                  {sky.modules.map((m, i) => {
                    const lit = m.home.filter((id) => seen.includes(id)).length;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          className="const-row hue"
                          style={hueOf(i)}
                          data-hot={hoverModule === m.id}
                          onClick={() => openModule(m.id)}
                          onMouseEnter={() => setHoverModule(m.id)}
                          onMouseLeave={() => setHoverModule(null)}
                          aria-label={`M${m.num} ${m.title}: ${lit} de ${m.home.length} hosts en línea`}
                        >
                          <span className="const-num">M{String(i + 1).padStart(2, "0")}</span>
                          <span className="min-w-0">
                            <span className="const-name">{m.title}</span>
                            <span className="const-cidr">{subnetFor(i)}</span>
                          </span>
                          <span className="const-dots" aria-hidden>
                            {m.home.map((id) => (
                              <i key={id} data-on={seen.includes(id)} />
                            ))}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            {asterismList || (
              <button type="button" className="ast-invite" onClick={startTrace}>
                <PenLine size={16} aria-hidden />
                <span>
                  <span className="block text-ink">Traza tu propia ruta</span>
                  <span className="block text-sm text-neutral">Enlaza conceptos que creas relacionados y anúnciala con su AS.</span>
                </span>
              </button>
            )}
            <ul className="grid gap-xs text-sm text-neutral">
              <li className="flex items-center gap-sm">
                <span className="legend-dot legend-module" aria-hidden /> Módulo = subred; el arco orquídea es tu avance en el DoD.
              </li>
              <li className="flex items-center gap-sm">
                <span className="legend-dot legend-concept" aria-hidden /> Concepto (host) sin explorar: luz tenue.
              </li>
              <li className="flex items-center gap-sm">
                <span className="legend-dot legend-seen" aria-hidden /> Host en línea: ya lo abriste; brilla con el color de su subred.
              </li>
              <li className="flex items-center gap-sm">
                <span className="legend-line" aria-hidden /> Ruta recomendada entre módulos; los puntos que viajan son paquetes.
              </li>
              <li className="flex items-center gap-sm">
                <span className="legend-ast" aria-hidden /> Tus rutas: enlaces que tú trazas.
              </li>
            </ul>
          </div>
        )}
      </aside>
    </section>
  );
}

function ConceptCard({
  concept,
  sky,
  order,
  onModule,
  onBack,
}: {
  concept: SkyConcept;
  sky: Sky;
  order: Map<string, number>;
  onModule: (id: string) => void;
  onBack: () => void;
}) {
  const home = sky.modules.find((m) => m.id === concept.home)!;
  return (
    <article className="grid gap-md hue" style={hueOf(order.get(home.id)!)}>
      <button type="button" className="link-quiet inline-flex w-fit items-center gap-2xs text-sm" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden />
        Subred M{home.num} · {home.title}
      </button>
      <h2 className="concept-title">{concept.term}</h2>
      <p className="text-md text-ink">{concept.short}</p>
      <div className="concept-analogy hud">
        <p className="label-mono">Piénsalo así</p>
        <p className="mt-2xs text-ink">{concept.analogy}</p>
      </div>
      <div className="border-l-2 border-deny pl-sm">
        <p className="label-mono">Por qué importa en seguridad</p>
        <p className="mt-2xs text-muted">{concept.why}</p>
      </div>
      <div>
        <p className="label-mono">Aparece en</p>
        <ul className="mt-xs flex flex-wrap gap-xs">
          {concept.modules.map((id) => {
            const m = sky.modules.find((x) => x.id === id)!;
            return (
              <li key={id}>
                <button type="button" className="star-chip hue" style={hueOf(order.get(id)!)} data-seen={id === concept.home} onClick={() => onModule(id)}>
                  <span className="chip-dot" aria-hidden />M{m.num} {id === concept.home ? "· su casa" : ""}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="label-mono">Explicación de apoyo del glosario de la app; la fuente técnica es la teoría de cada módulo.</p>
    </article>
  );
}
