import type { Box, TopoFlow, TopoLink, TopoNode } from "./types";

// Deterministic layered layout. Rank = longest distance along declared flows, so
// packets travel left → right. Containers (k8s nodes, VPC, subnets) lay their
// children out with the same rule, recursively. No physics, no randomness: the
// same blueprint always renders the same picture, at build time.

export const NODE_W = 172;
export const NODE_H = 68;
const COL_GAP = 76;
const ROW_GAP = 28;
const PAD = 18;
const HEADER = 30;
const MARGIN = 28;

function computeRanks(nodes: TopoNode[], links: TopoLink[], flows: TopoFlow[]): Map<string, number> {
  const rank = new Map<string, number>();
  const edges: [string, string][] = [];
  for (const f of flows) for (let i = 1; i < f.hops.length; i++) edges.push([f.hops[i - 1]!.node, f.hops[i]!.node]);
  for (const f of flows) for (const h of f.hops) if (!rank.has(h.node)) rank.set(h.node, 0);
  // Longest-path relaxation; bounded so a cyclic blueprint cannot hang the build.
  for (let iter = 0; iter < nodes.length + 1; iter++) {
    let changed = false;
    for (const [a, b] of edges) {
      const next = (rank.get(a) ?? 0) + 1;
      if (next > (rank.get(b) ?? 0) && next <= nodes.length) {
        rank.set(b, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Nodes outside every flow sit next to what they connect to.
  for (let iter = 0; iter < nodes.length; iter++) {
    let changed = false;
    for (const n of nodes) {
      if (rank.has(n.id) || n.container) continue;
      const neigh = links
        .filter((l) => l.from === n.id || l.to === n.id)
        .map((l) => rank.get(l.from === n.id ? l.to : l.from))
        .filter((r): r is number => r !== undefined);
      if (neigh.length) {
        rank.set(n.id, Math.round(neigh.reduce((a, b) => a + b, 0) / neigh.length));
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const n of nodes) if (!rank.has(n.id) && !n.container) rank.set(n.id, 0);
  return rank;
}

type Sized = { id: string; w: number; h: number; rank: number; order: number; children: Sized[]; cols: Sized[][] };

export function layoutTopology(nodes: TopoNode[], links: TopoLink[], flows: TopoFlow[]) {
  const rank = computeRanks(nodes, links, flows);
  const inFlow = new Set(flows.flatMap((f) => f.hops.map((h) => h.node)));
  const order = new Map(nodes.map((n, i) => [n.id, (inFlow.has(n.id) ? 0 : 1000) + i]));
  const childrenOf = (id: string | null) => nodes.filter((n) => n.parent === id);

  function size(n: TopoNode): Sized {
    if (!n.container) {
      return { id: n.id, w: NODE_W, h: NODE_H, rank: rank.get(n.id) ?? 0, order: order.get(n.id)!, children: [], cols: [] };
    }
    const kids = childrenOf(n.id).map(size);
    const { w, h, cols } = arrange(kids);
    const r = kids.length ? Math.min(...kids.map((k) => k.rank)) : 0;
    return {
      id: n.id,
      w: Math.max(w + PAD * 2, NODE_W + PAD * 2),
      h: Math.max(h, NODE_H) + PAD * 2 + HEADER,
      rank: r,
      order: Math.min(order.get(n.id)!, ...kids.map((k) => k.order)),
      children: kids,
      cols,
    };
  }

  function arrange(items: Sized[]) {
    const byRank = new Map<number, Sized[]>();
    for (const it of items) byRank.set(it.rank, [...(byRank.get(it.rank) ?? []), it]);
    const cols = [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c.sort((a, b) => a.order - b.order));
    const colW = cols.map((c) => Math.max(...c.map((i) => i.w)));
    const colH = cols.map((c) => c.reduce((s, i) => s + i.h, 0) + ROW_GAP * (c.length - 1));
    const w = colW.reduce((s, x) => s + x, 0) + COL_GAP * Math.max(cols.length - 1, 0);
    const h = colH.length ? Math.max(...colH) : 0;
    return { w, h, cols };
  }

  const boxes: Record<string, Box> = {};
  function place(cols: Sized[][], x0: number, y0: number, height: number) {
    let x = x0;
    for (const col of cols) {
      const cw = Math.max(...col.map((i) => i.w));
      const ch = col.reduce((s, i) => s + i.h, 0) + ROW_GAP * (col.length - 1);
      let y = y0 + (height - ch) / 2;
      for (const it of col) {
        const bx = x + (cw - it.w) / 2;
        boxes[it.id] = { x: bx, y, w: it.w, h: it.h };
        if (it.cols.length) {
          const innerH = it.h - PAD * 2 - HEADER;
          const innerW = it.cols.reduce((s, c) => s + Math.max(...c.map((i) => i.w)), 0) + COL_GAP * (it.cols.length - 1);
          place(it.cols, bx + (it.w - innerW) / 2, y + HEADER + PAD, innerH);
        }
        y += it.h + ROW_GAP;
      }
      x += cw + COL_GAP;
    }
  }

  const top = childrenOf(null).map(size);
  const { w, h, cols } = arrange(top);
  place(cols, MARGIN, MARGIN, h);
  return { width: Math.ceil(w + MARGIN * 2), height: Math.ceil(h + MARGIN * 2), boxes };
}
