import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Nodes } from "mdast";
import { loadModules } from "@/lib/content";
import { MECHANISMS, mechanismFor } from "@/lib/mechanisms";

// Every figure in the theory, as the page renders them (indented or fenced code).
const figures = loadModules().flatMap((m) => {
  const out: { module: string; source: string }[] = [];
  const walk = (n: Nodes) => {
    if (n.type === "code") out.push({ module: m.meta.id, source: n.value });
    else if ("children" in n) (n.children as Nodes[]).forEach(walk);
  };
  walk(unified().use(remarkParse).parse(m.theory.markdown));
  return out;
});

describe("mechanism diagrams", () => {
  it("has figures to test against", () => {
    expect(figures.length).toBeGreaterThan(10);
  });

  it("ties every curated diagram to exactly one figure", () => {
    for (const spec of MECHANISMS) {
      const hits = figures.filter((f) => mechanismFor(f.source) === spec);
      expect(hits.length, spec.title).toBe(1);
    }
  });

  it("never shows the same diagram twice", () => {
    const titles = figures.map((f) => mechanismFor(f.source)?.title).filter(Boolean);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(MECHANISMS.map((m) => m.title)).size).toBe(MECHANISMS.length);
  });

  it("has no generic stand-in: an unknown figure gets no diagram", () => {
    expect(mechanismFor("un formato futuro")).toBeNull();
  });

  it("turns the module-one flow into a packet lifecycle", () => {
    const d = mechanismFor("proceso cliente\n│ abre socket TCP\nIPv4\nrouter/firewall\nservidor");
    expect(d?.steps.map((step) => step.label)).toEqual(["proceso", "TCP", "IPv4", "ruta / firewall", "servidor"]);
  });
});
