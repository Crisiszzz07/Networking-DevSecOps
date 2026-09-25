import type { Box } from "@/lib/types";

export type Pt = { x: number; y: number };

/** Edge anchors: leave/enter through the facing sides so curves never cross their own boxes. */
export function anchors(a: Box, b: Box): { from: Pt; to: Pt; horizontal: boolean } {
  if (b.x >= a.x + a.w - 1) return { from: { x: a.x + a.w, y: a.y + a.h / 2 }, to: { x: b.x, y: b.y + b.h / 2 }, horizontal: true };
  if (b.x + b.w <= a.x + 1) return { from: { x: a.x, y: a.y + a.h / 2 }, to: { x: b.x + b.w, y: b.y + b.h / 2 }, horizontal: true };
  if (b.y >= a.y + a.h) return { from: { x: a.x + a.w / 2, y: a.y + a.h }, to: { x: b.x + b.w / 2, y: b.y }, horizontal: false };
  return { from: { x: a.x + a.w / 2, y: a.y }, to: { x: b.x + b.w / 2, y: b.y + b.h }, horizontal: false };
}

const r = (n: number) => Math.round(n * 10) / 10;

export function curve(from: Pt, to: Pt, horizontal: boolean): string {
  if (horizontal) {
    const dx = (to.x - from.x) / 2;
    return `C ${r(from.x + dx)} ${r(from.y)}, ${r(to.x - dx)} ${r(to.y)}, ${r(to.x)} ${r(to.y)}`;
  }
  const dy = (to.y - from.y) / 2;
  return `C ${r(from.x)} ${r(from.y + dy)}, ${r(to.x)} ${r(to.y - dy)}, ${r(to.x)} ${r(to.y)}`;
}

export function linkPath(a: Box, b: Box): string {
  const { from, to, horizontal } = anchors(a, b);
  return `M ${r(from.x)} ${r(from.y)} ${curve(from, to, horizontal)}`;
}

/** One continuous path through every hop, so a single animateMotion can follow it. */
export function flowPath(boxes: Box[]): { d: string; end: Pt } | null {
  if (boxes.length < 2) return null;
  let d = "";
  let end: Pt = { x: 0, y: 0 };
  for (let i = 1; i < boxes.length; i++) {
    const { from, to, horizontal } = anchors(boxes[i - 1]!, boxes[i]!);
    d += i === 1 ? `M ${r(from.x)} ${r(from.y)} ` : `L ${r(from.x)} ${r(from.y)} `;
    d += curve(from, to, horizontal) + " ";
    end = to;
  }
  return { d: d.trim(), end };
}
