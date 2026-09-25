"use client";

import { useEffect, useRef } from "react";

// The deep sky behind the constellations: a real celestial sphere seen in
// orthographic projection. Background stars (with colour temperature and
// twinkle), a Milky Way band made of clustered particles and an optional RA/Dec
// grid all live on the sphere, so rotating it moves them along curved paths.
// The constellations of the roadmap sit on top, like the plates of an atlas.

type Star = { x: number; y: number; z: number; mag: number; col: number; ph: number; sp: number };
type Dust = { x: number; y: number; z: number; a: number; s: number };
type Blob = { x: number; y: number; z: number; a: number; r: number; col: number };

export type SphereView = { lon: number; lat: number };

const DEG = Math.PI / 180;
/** Colour temperature from blue-white through lavender to warm amber, as rgb. */
const TEMPS = ["205,214,255", "226,228,255", "240,232,255", "255,226,246", "255,224,196", "255,204,158"];
const TEMP_W = [0.17, 0.28, 0.27, 0.14, 0.09, 0.05];
const BLOB_COLS = ["150,110,255", "205,120,255", "255,140,220", "120,130,255"];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000003) / 1000003;
  };
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

function fromRaDec(ra: number, dec: number) {
  return { x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) };
}

// Milky Way: a great circle that crosses the opening view diagonally.
const VIEW0 = { lon: -40 * DEG, lat: 28 * DEG };
const MW = (() => {
  // Direction at the centre of the opening view (see projector: centre RA = 90° − lon, Dec = −lat).
  const ra = Math.PI / 2 - VIEW0.lon;
  const dec = -VIEW0.lat + 6 * DEG;
  const c = fromRaDec(ra, dec);
  const east = { x: -Math.sin(ra), y: Math.cos(ra), z: 0 };
  const north = { x: -Math.sin(dec) * Math.cos(ra), y: -Math.sin(dec) * Math.sin(ra), z: Math.cos(dec) };
  const al = 32 * DEG;
  const u = {
    x: east.x * Math.cos(al) + north.x * Math.sin(al),
    y: east.y * Math.cos(al) + north.y * Math.sin(al),
    z: east.z * Math.cos(al) + north.z * Math.sin(al),
  };
  const n = { x: c.y * u.z - c.z * u.y, y: c.z * u.x - c.x * u.z, z: c.x * u.y - c.y * u.x };
  return { c, u, n };
})();
function onBand(theta: number, off: number) {
  const { c, u, n } = MW;
  const a = Math.cos(theta) * Math.cos(off);
  const b = Math.sin(theta) * Math.cos(off);
  const d = Math.sin(off);
  return { x: c.x * a + u.x * b + n.x * d, y: c.y * a + u.y * b + n.y * d, z: c.z * a + u.z * b + n.z * d };
}

let catalog: { stars: Star[]; dust: Dust[]; blobs: Blob[] } | null = null;

function buildCatalog() {
  if (catalog) return catalog;
  const r = rng(20260924);
  const pickTemp = () => {
    let v = r();
    for (let i = 0; i < TEMP_W.length; i++) if ((v -= TEMP_W[i]!) <= 0) return i;
    return 0;
  };
  const stars: Star[] = [];
  for (let i = 0; i < 5200; i++) {
    // Uniform on the sphere, with a third of the stars crowding toward the band.
    let p;
    if (i % 3 === 0) p = onBand(r() * Math.PI * 2, gauss(r) * 12 * DEG);
    else p = fromRaDec(r() * Math.PI * 2, Math.asin(r() * 2 - 1));
    // Magnitude: many faint, few bright (power law).
    const mag = Math.pow(r(), 5.5);
    stars.push({ ...p, mag, col: pickTemp(), ph: r() * Math.PI * 2, sp: 0.6 + r() * 2.2 });
  }
  const dust: Dust[] = [];
  const blobs: Blob[] = [];
  // Clustered noise: knots along the band, each shedding a cloud of particles.
  for (let k = 0; k < 150; k++) {
    const theta = r() * Math.PI * 2;
    const off = gauss(r) * 5 * DEG;
    const spread = (1.5 + r() * 3.5) * DEG;
    const n = 25 + Math.floor(r() * 50);
    for (let j = 0; j < n; j++) {
      const t = theta + (gauss(r) * spread) / 1.2;
      const o = off + gauss(r) * spread;
      // A dark rift runs down the middle of one stretch of the band.
      if (Math.sin(t) > 0.1 && Math.sin(t) < 0.75 && Math.abs(o - 0.6 * DEG) < 1.3 * DEG && r() < 0.85) continue;
      dust.push({ ...onBand(t, o), a: 0.18 + r() * 0.4, s: r() < 0.15 ? 1.6 : 1 });
    }
    blobs.push({ ...onBand(theta, off), a: 0.07 + r() * 0.1, r: 0.04 + r() * 0.08, col: Math.floor(r() * BLOB_COLS.length) });
  }
  for (let j = 0; j < 1800; j++) dust.push({ ...onBand(r() * Math.PI * 2, gauss(r) * 9 * DEG), a: 0.06 + r() * 0.18, s: 1 });
  // Sorted so the painter changes fill colour / alpha a handful of times, not per point.
  stars.sort((a, b) => a.col - b.col);
  for (const d of dust) d.a = Math.round(d.a * 10) / 10;
  dust.sort((a, b) => a.a - b.a);
  catalog = { stars, dust, blobs };
  return catalog;
}

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(rgb: string, soft = false) {
  const key = rgb + soft;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.5, `rgba(${rgb},0.35)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
  } else {
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.12, `rgba(${rgb},0.8)`);
    grad.addColorStop(0.35, `rgba(${rgb},0.16)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sprites.set(key, c);
  return c;
}

type Proj = (x: number, y: number, z: number) => { X: number; Y: number; d: number };

function projector(w: number, h: number, view: SphereView): { P: Proj; R: number } {
  const R = Math.max(w, h) * 0.82;
  const cl = Math.cos(view.lon);
  const sl = Math.sin(view.lon);
  const cp = Math.cos(view.lat);
  const sp = Math.sin(view.lat);
  const cx = w / 2;
  const cy = h / 2;
  return {
    R,
    P: (x, y, z) => {
      const x1 = x * cl - y * sl;
      const y1 = x * sl + y * cl;
      const y2 = y1 * cp - z * sp;
      const z2 = y1 * sp + z * cp;
      return { X: cx + x1 * R, Y: cy - z2 * R, d: y2 };
    },
  };
}

function polyline(ctx: CanvasRenderingContext2D, P: Proj, pts: { x: number; y: number; z: number }[]) {
  let pen = false;
  ctx.beginPath();
  for (const p of pts) {
    const q = P(p.x, p.y, p.z);
    if (q.d <= 0.02) {
      pen = false;
      continue;
    }
    if (pen) ctx.lineTo(q.X, q.Y);
    else ctx.moveTo(q.X, q.Y);
    pen = true;
  }
  ctx.stroke();
}

/** Paint the deep sky into ctx (w×h CSS pixels). Shared by the live canvas and the PNG export. */
export function paintSky(ctx: CanvasRenderingContext2D, w: number, h: number, view: SphereView, opts: { grid: boolean; t: number; twinkle: boolean }) {
  const { stars, dust, blobs } = buildCatalog();
  const { P, R } = projector(w, h, view);
  const inView = (q: { X: number; Y: number; d: number }, m = 40) => q.d > 0 && q.X > -m && q.X < w + m && q.Y > -m && q.Y < h + m;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Milky Way glow, then its grain.
  for (const b of blobs) {
    const q = P(b.x, b.y, b.z);
    const size = b.r * R;
    if (!inView(q, size)) continue;
    ctx.globalAlpha = b.a * Math.min(1, q.d * 3);
    ctx.drawImage(sprite(BLOB_COLS[b.col]!, true), q.X - size, q.Y - size, size * 2, size * 2);
  }
  ctx.fillStyle = "rgb(225,210,255)";
  let alpha = -1;
  for (const p of dust) {
    const q = P(p.x, p.y, p.z);
    if (!inView(q, 2)) continue;
    if (p.a !== alpha) ctx.globalAlpha = alpha = p.a;
    ctx.fillRect(q.X, q.Y, p.s, p.s);
  }

  // Stars: faint ones are single pixels, bright ones a glow sprite (+ spikes).
  let col = -1;
  for (const s of stars) {
    const q = P(s.x, s.y, s.z);
    if (!inView(q, 20)) continue;
    const tw = opts.twinkle ? 0.72 + 0.28 * Math.sin(opts.t * s.sp + s.ph) : 1;
    const rgb = TEMPS[s.col]!;
    if (s.mag > 0.26) {
      const size = 3 + s.mag * 18;
      ctx.globalAlpha = (0.35 + s.mag * 0.65) * tw;
      ctx.drawImage(sprite(rgb), q.X - size, q.Y - size, size * 2, size * 2);
      if (s.mag > 0.62) {
        // Diffraction spikes on the brightest few.
        ctx.globalAlpha = 0.35 * tw;
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(q.X - size * 1.3, q.Y);
        ctx.lineTo(q.X + size * 1.3, q.Y);
        ctx.moveTo(q.X, q.Y - size * 1.3);
        ctx.lineTo(q.X, q.Y + size * 1.3);
        ctx.stroke();
      }
    } else {
      if (s.col !== col) {
        ctx.fillStyle = `rgb(${rgb})`;
        col = s.col;
      }
      ctx.globalAlpha = Math.min(1, 0.38 + s.mag * 3.5) * tw;
      const d = s.mag > 0.1 ? 1.8 : s.mag > 0.02 ? 1.4 : 1.1;
      ctx.fillRect(q.X - d / 2, q.Y - d / 2, d, d);
    }
  }
  ctx.restore();

  if (!opts.grid) return;

  // RA/Dec grid in fine engraved lines, plus the ecliptic.
  ctx.save();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgba(214,190,255,0.3)";
  const step = 2 * DEG;
  for (let dec = -75; dec <= 75; dec += 15) {
    const pts = [];
    for (let ra = 0; ra <= Math.PI * 2 + step; ra += step) pts.push(fromRaDec(ra, dec * DEG));
    ctx.globalAlpha = dec === 0 ? 1.6 : 1;
    ctx.lineWidth = dec === 0 ? 1.1 : 0.8;
    polyline(ctx, P, pts);
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 0.8;
  for (let h = 0; h < 24; h++) {
    const pts = [];
    for (let dec = -80; dec <= 80; dec += 2) pts.push(fromRaDec(h * 15 * DEG, dec * DEG));
    polyline(ctx, P, pts);
  }
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = "rgba(255,160,230,0.45)";
  const eps = 23.44 * DEG;
  const ecl = [];
  for (let l = 0; l <= Math.PI * 2 + step; l += step) {
    const x = Math.cos(l);
    const y = Math.sin(l) * Math.cos(eps);
    const z = Math.sin(l) * Math.sin(eps);
    ecl.push({ x, y, z });
  }
  polyline(ctx, P, ecl);
  ctx.setLineDash([]);

  // Labels: hours along the equator, degrees along the meridian nearest the centre.
  ctx.font = `11px ${getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace"}`;
  ctx.fillStyle = "rgba(226,208,255,0.6)";
  ctx.textAlign = "center";
  for (let h = 0; h < 24; h++) {
    const p = fromRaDec(h * 15 * DEG, 0);
    const q = P(p.x, p.y, p.z);
    if (inView(q, -10)) ctx.fillText(`${h}ʰ`, q.X, q.Y - 6);
  }
  const center = (((90 - view.lon / DEG) / 15) % 24 + 24) % 24;
  const hr = Math.round(center) * 15 * DEG;
  for (let dec = -60; dec <= 60; dec += 30) {
    if (dec === 0) continue;
    const p = fromRaDec(hr, dec * DEG);
    const q = P(p.x, p.y, p.z);
    if (inView(q, -10)) ctx.fillText(`${dec > 0 ? "+" : "−"}${Math.abs(dec)}°`, q.X + 16, q.Y + 4);
  }
  ctx.restore();
}

// The live view is module state so the PNG export can paint the same sky.
const view: SphereView = { ...VIEW0 };
export const currentView = (): SphereView => ({ ...view });

const INTERACTIVE = "a, button, input, textarea, select, [role='button'], [data-no-drag]";

/**
 * Canvas layer. Drag (mouse or pen) on empty sky to turn the sphere; it keeps a
 * little inertia and otherwise drifts slowly westward. A drag never becomes a click.
 */
export function CelestialSphere({ grid, dragTarget }: { grid: boolean; dragTarget: React.RefObject<HTMLElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef(grid);
  const kick = useRef<() => void>(() => {});
  gridRef.current = grid;

  useEffect(() => {
    kick.current();
  }, [grid]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let lastPaint = 0;
    let vel = 0;
    let velLat = 0;
    let drag: { x: number; y: number; id: number; moved: boolean } | null = null;

    const resize = () => {
      const box = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = box.width;
      h = box.height;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(performance.now());
    };

    const paint = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      paintSky(ctx, w, h, view, { grid: gridRef.current, t: now / 1000, twinkle: !reduce });
      lastPaint = now;
    };

    const loop = (now: number) => {
      raf = 0;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!drag) {
        view.lon += (reduce ? 0 : 0.45 * DEG) * dt + vel * dt;
        view.lat = Math.max(8 * DEG, Math.min(78 * DEG, view.lat + velLat * dt));
        vel *= Math.pow(0.04, dt);
        velLat *= Math.pow(0.04, dt);
      }
      // ~20 fps is plenty for a slow sky; every frame while dragging.
      if (drag || now - lastPaint > 48) paint(now);
      schedule();
    };
    const schedule = () => {
      if (raf || !visible || document.hidden) return;
      if (reduce && !drag && Math.abs(vel) < 1e-4 && Math.abs(velLat) < 1e-4) return;
      raf = requestAnimationFrame(loop);
    };
    kick.current = () => {
      paint(performance.now());
      schedule();
    };

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      last = performance.now();
      schedule();
    });
    io.observe(el);
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const onVis = () => {
      last = performance.now();
      schedule();
    };
    document.addEventListener("visibilitychange", onVis);

    const target = dragTarget.current;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      if ((e.target as Element).closest(INTERACTIVE)) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
      vel = velLat = 0;
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        target?.setAttribute("data-dragging", "true");
      }
      const k = 1 / (Math.max(w, h) * 0.82);
      view.lon += dx * k;
      view.lat = Math.max(8 * DEG, Math.min(78 * DEG, view.lat + dy * k));
      vel = (dx * k) / 0.016;
      velLat = (dy * k) / 0.016;
      drag.x = e.clientX;
      drag.y = e.clientY;
      schedule();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        target?.removeAttribute("data-dragging");
        // Swallow the click that follows the drag so it doesn't zoom out.
        const stop = (ev: Event) => ev.stopPropagation();
        window.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
      }
      drag = null;
      last = performance.now();
      schedule();
    };
    target?.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    resize();
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      target?.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragTarget]);

  return <canvas ref={canvas} className="sky-sphere" aria-hidden />;
}
