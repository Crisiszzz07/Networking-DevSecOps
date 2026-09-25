import { describe, expect, it } from "vitest";
import { loadModules } from "./content";
import { buildSky } from "./sky";

const sky = buildSky(loadModules());

describe("constellation sky", () => {
  it("gives every module its own stars", () => {
    for (const m of sky.modules) expect(m.home.length, m.id).toBeGreaterThanOrEqual(3);
  });

  it("does not put the eBPF TC hook in the DNS module (TC=1 is a DNS flag)", () => {
    expect(sky.concepts.find((c) => c.id === "tc")!.modules).toEqual(["modulo-05"]);
  });

  it("keeps every star inside both canvases, apart from its neighbours", () => {
    for (const mode of ["wide", "tall"] as const) {
      const size = sky.size[mode];
      const pts = [...sky.modules, ...sky.concepts].map((s) => ({ id: s.id, ...s.pos[mode] }));
      for (const p of pts) {
        expect(p.x, `${mode}/${p.id}`).toBeGreaterThan(20);
        expect(p.x).toBeLessThan(size.x - 20);
        expect(p.y, `${mode}/${p.id}`).toBeGreaterThan(20);
        expect(p.y).toBeLessThan(size.y - 20);
      }
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
          expect(d, `${mode}: ${pts[i]!.id} vs ${pts[j]!.id}`).toBeGreaterThan(40);
        }
    }
  });

  it("links figures as trees (n-1 edges per constellation)", () => {
    for (const m of sky.modules) {
      expect(sky.edges.filter((e) => e.kind === "figure" && e.module === m.id)).toHaveLength(m.home.length);
    }
  });
});
