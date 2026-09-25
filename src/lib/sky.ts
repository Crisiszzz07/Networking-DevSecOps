import { conceptsIn, countIn, GLOSSARY } from "./glossary";
import type { LearningModule } from "./types";

// The roadmap as a night sky. Each module is a bright star; every glossary
// concept that the module's theory actually discusses orbits it. A concept
// "lives" in the module that talks about it most and echoes into the others.
// Figures are minimum spanning trees, so each constellation gets its own
// shape from its own content. All positions are deterministic (build time).

export type SkyPoint = { x: number; y: number };

export type SkyConcept = {
  id: string;
  term: string;
  short: string;
  analogy: string;
  why: string;
  home: string;
  modules: string[];
  magnitude: number;
  pos: { wide: SkyPoint; tall: SkyPoint };
};

export type SkyModule = {
  id: string;
  num: string;
  slug: string;
  title: string;
  layer: string;
  labId: string;
  objective: string;
  runtime: string;
  checkCount: number;
  dependsOn: string[];
  books: { abbr: string | null; title: string }[];
  home: string[];
  echoes: string[];
  pos: { wide: SkyPoint; tall: SkyPoint };
};

export type SkyEdge = { a: string; b: string; kind: "figure" | "path" | "echo"; module: string };

export type Sky = {
  size: { wide: SkyPoint; tall: SkyPoint };
  modules: SkyModule[];
  concepts: SkyConcept[];
  edges: SkyEdge[];
  dust: { x: number; y: number; r: number; o: number; d: number }[];
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

const WIDE = { x: 2000, y: 1300 };
const TALL = { x: 1100, y: 0 };

function centers(n: number) {
  const wide: SkyPoint[] = [];
  const tall: SkyPoint[] = [];
  for (let i = 0; i < n; i++) {
    const step = n > 1 ? (WIDE.x - 600) / (n - 1) : 0;
    wide.push({ x: 300 + i * step, y: i % 2 === 0 ? 450 : 880 });
    tall.push({ x: i % 2 === 0 ? 380 : 720, y: 330 + i * 520 });
  }
  return { wide, tall, tallHeight: 330 + (n - 1) * 520 + 360 };
}

function mst(ids: string[], pos: Record<string, SkyPoint>): [string, string][] {
  if (ids.length < 2) return [];
  const inTree = new Set([ids[0]!]);
  const edges: [string, string][] = [];
  while (inTree.size < ids.length) {
    let best: [string, string, number] | null = null;
    for (const a of inTree) {
      for (const b of ids) {
        if (inTree.has(b)) continue;
        const d = Math.hypot(pos[a]!.x - pos[b]!.x, pos[a]!.y - pos[b]!.y);
        if (!best || d < best[2]) best = [a, b, d];
      }
    }
    inTree.add(best![1]);
    edges.push([best![0], best![1]]);
  }
  return edges;
}

// A concept that heads a row of a module's comparison table is that module's subject.
function tableBoost(text: string, g: { match: RegExp }): number {
  return text.split("\n").some((l) => { const cell = l.match(/^\|\s*([^|]+?)\s*\|/); return cell ? g.match.test(cell[1]!) : false; }) ? 3 : 0;
}

export function buildSky(mods: LearningModule[]): Sky {
  const texts = mods.map((m) => m.theory.markdown + "\n" + m.gotchas.map((g) => g.text).join("\n"));
  const appears = new Map<string, { module: string; count: number }[]>();
  mods.forEach((m, i) => {
    for (const g of conceptsIn(texts[i]!)) {
      appears.set(g.id, [...(appears.get(g.id) ?? []), { module: m.meta.id, count: countIn(texts[i]!, g) + tableBoost(texts[i]!, g) }]);
    }
  });

  const home = new Map<string, string>();
  for (const [id, list] of appears) {
    const hint = GLOSSARY.find((g) => g.id === id)?.layer;
    const hinted = hint ? mods.find((m) => m.meta.layer === hint && list.some((x) => x.module === m.meta.id)) : undefined;
    if (hinted) {
      home.set(id, hinted.meta.id);
      continue;
    }
    // Most discussed wins; earlier module breaks ties.
    home.set(id, [...list].sort((a, b) => b.count - a.count)[0]!.module);
  }

  const { wide, tall, tallHeight } = centers(mods.length);
  const concepts: SkyConcept[] = [];
  const modules: SkyModule[] = [];
  const edges: SkyEdge[] = [];

  mods.forEach((m, i) => {
    const own = GLOSSARY.filter((g) => home.get(g.id) === m.meta.id);
    const echoes = conceptsIn(texts[i]!).filter((g) => home.get(g.id) !== m.meta.id).map((g) => g.id);
    const rand = rng(hash(m.meta.id));
    // Leave the sector under the star free: the module title is drawn there.
    const gap = 2.3;
    const span = Math.PI * 2 - gap;
    const posW: Record<string, SkyPoint> = { [m.meta.id]: wide[i]! };
    const posT: Record<string, SkyPoint> = { [m.meta.id]: tall[i]! };
    own.forEach((g, k) => {
      const angle = Math.PI / 2 + gap / 2 + ((k + 0.5) / own.length) * span + (rand() - 0.5) * (span / own.length) * 0.5;
      // Crowded constellations alternate between an inner and an outer ring.
      const outer = own.length > 6 && k % 2 === 1;
      const radius = (outer ? 215 : 125) + rand() * 45;
      const mk = (c: SkyPoint, squash: number): SkyPoint => ({
        x: Math.round(c.x + Math.cos(angle) * radius),
        y: Math.round(c.y + Math.sin(angle) * radius * squash),
      });
      const list = appears.get(g.id)!;
      const c: SkyConcept = {
        id: g.id,
        term: g.term,
        short: g.short,
        analogy: g.analogy,
        why: g.why,
        home: m.meta.id,
        modules: list.map((x) => x.module),
        magnitude: list.reduce((s, x) => s + x.count, 0),
        pos: { wide: mk(wide[i]!, 0.85), tall: mk(tall[i]!, 0.9) },
      };
      posW[g.id] = c.pos.wide;
      posT[g.id] = c.pos.tall;
      concepts.push(c);
    });
    for (const [a, b] of mst([m.meta.id, ...own.map((g) => g.id)], posW)) edges.push({ a, b, kind: "figure", module: m.meta.id });
    for (const e of echoes) edges.push({ a: m.meta.id, b: e, kind: "echo", module: m.meta.id });
    for (const d of m.meta.dependsOn) edges.push({ a: d, b: m.meta.id, kind: "path", module: m.meta.id });

    modules.push({
      id: m.meta.id,
      num: String(m.meta.order).padStart(2, "0"),
      slug: m.meta.slug,
      title: m.meta.title,
      layer: m.meta.layer,
      labId: m.lab.id,
      objective: m.lab.objective,
      runtime: m.meta.labRuntime,
      checkCount: m.lab.dod.checkCount,
      dependsOn: m.meta.dependsOn,
      books: m.meta.books.map((b) => ({ abbr: b.abbr, title: b.title })),
      home: own.map((g) => g.id),
      echoes,
      pos: { wide: wide[i]!, tall: tall[i]! },
    });
  });

  const r = rng(20260923);
  const dust = Array.from({ length: 320 }, () => ({
    x: Math.round(r() * 1000) / 1000,
    y: Math.round(r() * 1000) / 1000,
    r: Math.round((0.4 + r() * r() * 1.8) * 100) / 100,
    o: Math.round((0.15 + r() * 0.55) * 100) / 100,
    d: Math.round(r() * 6000),
  }));

  return { size: { wide: WIDE, tall: { x: TALL.x, y: tallHeight } }, modules, concepts, edges, dust };
}
