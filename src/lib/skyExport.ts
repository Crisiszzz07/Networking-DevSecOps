"use client";

import { currentView, paintSky } from "@/components/sky/CelestialSphere";
import type { Asterism } from "./atlas";
import { subnetFor } from "./names";
import type { Sky } from "./sky";

// "Guardar PNG": the whole sky exported as a network map — deep sky, the six
// subnets (constellations), the learner's routes and a HUD frame with corner brackets.

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function track(ctx: CanvasRenderingContext2D, spacing: string) {
  // letterSpacing is recent; older engines just ignore it.
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = spacing;
}

export async function exportSkyPng(sky: Sky, asterisms: Asterism[], seen: string[], grid: boolean) {
  await document.fonts?.ready;
  const M = 150;
  const W = sky.size.wide.x + M * 2;
  const H = sky.size.wide.y + M * 2 + 60;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const display = cssVar("--font-display") || "serif";
  const mono = cssVar("--font-mono") || "monospace";
  const gilt = "rgb(222,204,255)";

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "rgb(9,6,24)");
  bg.addColorStop(1, "rgb(34,18,63)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  paintSky(ctx, W, H, currentView(), { grid, t: 0, twinkle: false });

  // Frame: a hairline plus HUD corner brackets.
  ctx.strokeStyle = gilt;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3;
  const L = 46;
  for (const [x, y, dx, dy] of [
    [40, 40, 1, 1],
    [W - 40, 40, -1, 1],
    [40, H - 40, 1, -1],
    [W - 40, H - 40, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * L);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * L, y);
    ctx.stroke();
  }

  // Title block, top left like a console header.
  ctx.textAlign = "left";
  ctx.fillStyle = "rgb(246,240,255)";
  ctx.font = `700 44px ${display}`;
  track(ctx, "4px");
  ctx.fillText("MAPA ESTELAR DE RED", 96, 132);
  track(ctx, "0px");
  ctx.font = `400 22px ${mono}`;
  ctx.fillStyle = "rgb(190,200,255)";
  const date = new Date().toISOString().slice(0, 10);
  ctx.fillText(`$ sky map --export · ${date} · ${sky.modules.length} subredes · ${sky.concepts.length} hosts`, 96, 172);

  ctx.save();
  ctx.translate(M, M + 60);
  const byId = new Map<string, { x: number; y: number }>();
  sky.modules.forEach((m) => byId.set(m.id, m.pos.wide));
  sky.concepts.forEach((x) => byId.set(x.id, x.pos.wide));
  const order = new Map(sky.modules.map((m, i) => [m.id, i]));
  const hue = (i: number) => cssVar(`--hue-${(i % 6) + 1}`) || "300";

  // Constellation figures.
  ctx.lineCap = "round";
  for (const e of sky.edges.filter((x) => x.kind === "figure")) {
    const a = byId.get(e.a)!;
    const b = byId.get(e.b)!;
    ctx.strokeStyle = `oklch(80% 0.12 ${hue(order.get(e.module)!)} / 0.7)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Learner asterisms, in orchid.
  for (const a of asterisms) {
    ctx.strokeStyle = "oklch(84% 0.14 322)";
    ctx.lineWidth = 2.4;
    ctx.setLineDash([]);
    for (const [p, q] of a.edges) {
      const s = byId.get(p);
      const t = byId.get(q);
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
  }

  // Stars.
  for (const cpt of sky.concepts) {
    const p = cpt.pos.wide;
    const lit = seen.includes(cpt.id);
    const h = hue(order.get(cpt.home)!);
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, lit ? 30 : 16);
    glow.addColorStop(0, lit ? `oklch(92% 0.08 ${h} / 0.9)` : "rgba(240,232,255,0.5)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - 30, p.y - 30, 60, 60);
    ctx.fillStyle = lit ? `oklch(92% 0.07 ${h})` : "rgb(200,188,230)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, lit ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  sky.modules.forEach((m, i) => {
    const p = m.pos.wide;
    const h = hue(i);
    const bloom = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 120);
    bloom.addColorStop(0, `oklch(92% 0.07 ${h} / 0.95)`);
    bloom.addColorStop(0.2, `oklch(80% 0.13 ${h} / 0.45)`);
    bloom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(p.x - 120, p.y - 120, 240, 240);
    ctx.strokeStyle = `oklch(80% 0.13 ${h} / 0.8)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgb(250,246,255)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = `oklch(84% 0.11 ${h})`;
    ctx.font = `500 15px ${mono}`;
    ctx.fillText(`M${m.num} · ${m.layer}`, p.x, p.y - 64);
    ctx.fillStyle = "rgb(246,240,255)";
    ctx.font = `600 18px ${display}`;
    track(ctx, "1.5px");
    const words = m.title.toUpperCase().split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > 24 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = (cur + " " + w).trim();
    }
    if (cur) lines.push(cur);
    lines.forEach((l, n) => ctx.fillText(l, p.x, p.y + 72 + n * 22));
    track(ctx, "0px");
    ctx.font = `400 15px ${mono}`;
    ctx.fillStyle = "rgb(190,200,255)";
    ctx.fillText(subnetFor(i), p.x, p.y + 78 + lines.length * 22);
  });

  // Asterism names centred under their figure.
  for (const a of asterisms) {
    const pts = a.stars.map((id) => byId.get(id)).filter(Boolean) as { x: number; y: number }[];
    if (!pts.length) continue;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = Math.max(...pts.map((p) => p.y)) + 44;
    ctx.textAlign = "center";
    ctx.font = `700 17px ${display}`;
    track(ctx, "2px");
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(12,6,28,0.85)";
    ctx.strokeText(a.name.toUpperCase(), cx, cy);
    ctx.fillStyle = "oklch(88% 0.12 322)";
    ctx.fillText(a.name.toUpperCase(), cx, cy);
    track(ctx, "0px");
    ctx.font = `400 14px ${mono}`;
    const tag = `${a.asn} · ${a.stars.length} hosts`;
    ctx.strokeText(tag, cx, cy + 22);
    ctx.fillStyle = "rgba(236,222,255,0.85)";
    ctx.fillText(tag, cx, cy + 22);
  }
  ctx.restore();

  ctx.textAlign = "left";
  ctx.font = `400 18px ${mono}`;
  ctx.fillStyle = "rgba(226,208,255,0.7)";
  ctx.fillText(`hosts en línea: ${seen.length}/${sky.concepts.length} · rutas propias: ${asterisms.length} · redes/devsecops`, 96, H - 92);

  const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mapa-estelar-de-red.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
