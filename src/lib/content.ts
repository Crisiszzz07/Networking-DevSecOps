import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import type { Code, List, ListItem, Paragraph, Root, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { z } from "zod";
import { detectCommands, detectExpectation } from "./commands";
import { parseDod } from "./dod";
import { detectHeaders, tracePacket } from "./packet";
import { BlueprintSchema, FrontmatterSchema, type Frontmatter } from "./schema";
import { buildTopology } from "./topology";
import type { BookRef, CodeBlock, Gotcha, Lab, LearningModule, ModuleSummary, WalkthroughStep } from "./types";

export const MODULES_DIR = path.join(process.cwd(), "content", "modules");

export class ContentError extends Error {
  constructor(file: string, detail: string) {
    super(`[content] ${path.basename(file)}: ${detail}`);
  }
}

const SECTION_KEYS = {
  theory: /CORE MECHANICS|THEORY/i,
  blueprint: /SCHEMATIC|TOPOLOGY|BLUEPRINT/i,
  lab: /INTERACTIVE LAB|LAB SPECIFICATION/i,
  gotchas: /GOTCHAS|PITFALLS/i,
} as const;
type SectionKey = keyof typeof SECTION_KEYS;
type Section = { title: string; nodes: RootContent[]; markdown: string };

const LAB_FIELDS: [RegExp, keyof LabDraft][] = [
  [/^Lab Identifier/i, "id"],
  [/^Fuente del dise/i, "source"],
  [/^Objetivo/i, "objective"],
  [/^Topolog/i, "environment"],
  [/^Setup Script/i, "setup"],
  [/^Hands-On/i, "walkthrough"],
  [/^Definici[oó]n de Terminado|^DoD/i, "dod"],
];

type LabDraft = {
  id?: string;
  source?: string;
  objective?: string;
  environment?: string;
  setup?: CodeBlock;
  walkthrough?: WalkthroughStep[];
  dod?: string;
};

const LabDraftSchema = z.object({
  id: z.string().regex(/^lab-\d{2}-[a-z0-9-]+$/, "Lab Identifier debe ser lab-NN-slug"),
  source: z.string().optional(),
  objective: z.string().min(1, "falta Objetivo Práctico"),
  environment: z.string().min(1, "falta Topología del Entorno"),
  setup: z.object({ lang: z.string().nullable(), value: z.string().min(1) }),
  walkthrough: z.array(z.any()).min(1, "el walkthrough necesita al menos un paso"),
  dod: z
    .string()
    .min(1)
    .refine((s) => /echo\s+PASS-/.test(s), "el script DoD debe terminar con echo PASS-<lab>")
    .refine((s) => !/<</.test(s), "el script DoD no admite heredocs (una aserción por línea)"),
});

function splitFrontmatter(file: string, raw: string): { data: unknown; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new ContentError(file, "falta el bloque frontmatter --- … ---");
  return { data: yaml.load(m[1]!), body: raw.slice(m[0].length) };
}

function zodDetail(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ");
}

function sliceMarkdown(body: string, nodes: RootContent[]): string {
  const first = nodes[0]?.position?.start.offset;
  const last = nodes[nodes.length - 1]?.position?.end.offset;
  return first === undefined || last === undefined ? "" : body.slice(first, last);
}

function splitSections(file: string, body: string, tree: Root): Record<SectionKey, Section> {
  const found: Partial<Record<SectionKey, Section>> = {};
  let current: { key: SectionKey; title: string; nodes: RootContent[] } | null = null;
  const close = () => {
    if (current) found[current.key] = { title: current.title, nodes: current.nodes, markdown: sliceMarkdown(body, current.nodes) };
  };
  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 1) {
      close();
      const title = toString(node);
      const key = (Object.keys(SECTION_KEYS) as SectionKey[]).find((k) => SECTION_KEYS[k].test(title));
      if (!key) throw new ContentError(file, `sección desconocida «${title}»`);
      current = { key, title, nodes: [] };
    } else if (current) {
      current.nodes.push(node);
    }
  }
  close();
  for (const key of Object.keys(SECTION_KEYS) as SectionKey[]) {
    if (!found[key]) throw new ContentError(file, `falta la sección ${key} (${SECTION_KEYS[key].source})`);
  }
  return found as Record<SectionKey, Section>;
}

/** "**Label:** value" → [label, value]. */
function labelled(p: Paragraph): [string, string] | null {
  const head = p.children[0];
  if (!head || head.type !== "strong") return null;
  const label = toString(head).replace(/:\s*$/, "").trim();
  const value = toString({ type: "paragraph", children: p.children.slice(1) } as Paragraph).replace(/^:\s*/, "").trim();
  return [label, value];
}

function walkthroughFrom(list: List): WalkthroughStep[] {
  return list.children.map((item: ListItem, index) => {
    const text = item.children
      .filter((c): c is Paragraph => c.type === "paragraph")
      .map((p) => toString(p))
      .join("\n");
    const code = item.children
      .filter((c): c is Code => c.type === "code")
      .map((c) => ({ lang: c.lang ?? null, value: c.value }));
    return { index, text, commands: detectCommands(text), expectation: detectExpectation(text), code };
  });
}

function parseLab(file: string, section: Section): Lab {
  const draft: LabDraft = {};
  let awaiting: keyof LabDraft | null = null;
  for (const node of section.nodes) {
    if (node.type === "paragraph") {
      const pair = labelled(node);
      if (!pair) continue;
      const key = LAB_FIELDS.find(([re]) => re.test(pair[0]))?.[1];
      if (!key) continue;
      if (pair[1]) (draft as Record<string, unknown>)[key] = pair[1];
      awaiting = pair[1] ? null : key;
    } else if (node.type === "code" && awaiting === "setup") {
      draft.setup = { lang: node.lang ?? "bash", value: node.value };
      awaiting = null;
    } else if (node.type === "code" && awaiting === "dod") {
      draft.dod = node.value;
      awaiting = null;
    } else if (node.type === "list" && awaiting === "walkthrough") {
      draft.walkthrough = walkthroughFrom(node);
      awaiting = null;
    }
  }
  const res = LabDraftSchema.safeParse(draft);
  if (!res.success) throw new ContentError(file, `laboratorio inválido — ${zodDetail(res.error)}`);
  const lab = res.data;
  return {
    id: lab.id,
    source: lab.source ?? null,
    objective: lab.objective,
    environment: lab.environment,
    setup: lab.setup,
    walkthrough: lab.walkthrough as WalkthroughStep[],
    dod: parseDod(lab.dod, lab.id),
  };
}

function booksFrom(fm: Frontmatter, trace: string | null): BookRef[] {
  return fm.primary_books.map((b) => {
    let abbr: string | null = null;
    for (const candidate of [b.title, b.title.split(":")[0]!.trim()]) {
      const esc = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = trace?.match(new RegExp(`${esc}\\s*\\(([^)]+)\\)`));
      if (m) {
        abbr = m[1]!;
        break;
      }
    }
    return { title: b.title, chapters: b.chapters, competencies: b.target_competencies, abbr };
  });
}

export function parseModule(file: string, raw: string): LearningModule {
  const { data, body } = splitFrontmatter(file, raw);
  const fm = FrontmatterSchema.safeParse(data);
  if (!fm.success) throw new ContentError(file, `frontmatter inválido — ${zodDetail(fm.error)}`);

  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const sections = splitSections(file, body, tree);

  // Theory: the leading blockquote is the traceability note.
  const quote = sections.theory.nodes.find((n) => n.type === "blockquote");
  const trace = quote ? toString(quote).replace(/^Trazabilidad:\s*/i, "").trim() : null;
  const theoryNodes = sections.theory.nodes.filter((n) => n !== quote);

  // Blueprint: a source note plus one YAML code block.
  const bpSource = sections.blueprint.nodes
    .filter((n): n is Paragraph => n.type === "paragraph")
    .map(labelled)
    .find((p) => p && /^Fuente/i.test(p[0]))?.[1] ?? null;
  const bpCode = sections.blueprint.nodes.find((n): n is Code => n.type === "code");
  if (!bpCode) throw new ContentError(file, "el blueprint no contiene bloque de código YAML");
  let bpData: unknown;
  try {
    bpData = yaml.load(bpCode.value);
  } catch (e) {
    throw new ContentError(file, `YAML del blueprint no parsea — ${(e as Error).message}`);
  }
  const bp = BlueprintSchema.safeParse(bpData);
  if (!bp.success) throw new ContentError(file, `blueprint inválido — ${zodDetail(bp.error)}`);

  const lab = parseLab(file, sections.lab);
  const gotchaList = sections.gotchas.nodes.find((n): n is List => n.type === "list");
  const gotchas: Gotcha[] = gotchaList?.children.map((li) => ({ text: toString(li).trim() })) ?? [];

  const topology = buildTopology({
    blueprint: bp.data,
    setup: lab.setup.value,
    walkthroughCode: lab.walkthrough.flatMap((s) => s.code.map((c) => c.value)),
  });

  const warnings = lab.dod.lines.filter((l) => l.warning).map((l) => `DoD línea ${l.index + 1}: ${l.warning}`);
  const expectedLabNum = fm.data.id.slice(-2);
  if (!lab.id.startsWith(`lab-${expectedLabNum}-`)) warnings.push(`Lab ${lab.id} no coincide con ${fm.data.id}.`);

  const books = booksFrom(fm.data, trace);
  for (const b of books) if (!b.abbr) warnings.push(`No encontré la abreviatura de «${b.title}» en la nota de trazabilidad.`);

  const theoryMarkdown = sliceMarkdown(body, theoryNodes);
  return {
    meta: {
      id: fm.data.id,
      slug: fm.data.slug,
      title: fm.data.title,
      layer: fm.data.layer,
      order: Number(expectedLabNum),
      contentVersion: fm.data.content_version,
      labRuntime: fm.data.lab_runtime,
      books,
      dependsOn: fm.data.depends_on ?? [],
    },
    theory: { markdown: theoryMarkdown, trace },
    blueprintSource: bpSource,
    blueprintYaml: bpCode.value,
    lab,
    gotchas,
    topology,
    packet: tracePacket(topology),
    headers: detectHeaders(theoryMarkdown),
    warnings,
  };
}

let cache: LearningModule[] | null = null;

export function loadModules(dir = MODULES_DIR): LearningModule[] {
  if (cache && dir === MODULES_DIR) return cache;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const modules = files
    .map((f) => parseModule(path.join(dir, f), fs.readFileSync(path.join(dir, f), "utf8")))
    .sort((a, b) => a.meta.order - b.meta.order);

  // Cross-module contract: unique ids/slugs; dependencies default to the previous module.
  const ids = new Set<string>();
  const slugs = new Set<string>();
  modules.forEach((m, i) => {
    if (ids.has(m.meta.id)) throw new ContentError(m.meta.id, "id duplicado");
    if (slugs.has(m.meta.slug)) throw new ContentError(m.meta.id, `slug duplicado ${m.meta.slug}`);
    ids.add(m.meta.id);
    slugs.add(m.meta.slug);
    if (!m.meta.dependsOn.length && i > 0) m.meta.dependsOn = [modules[i - 1]!.meta.id];
  });
  for (const m of modules) {
    for (const d of m.meta.dependsOn) if (!ids.has(d)) throw new ContentError(m.meta.id, `depends_on apunta a ${d}, que no existe`);
  }
  if (dir === MODULES_DIR) cache = modules;
  return modules;
}

export function getModule(slug: string): LearningModule | undefined {
  return loadModules().find((m) => m.meta.slug === slug);
}

export function summarise(m: LearningModule): ModuleSummary {
  return {
    meta: m.meta,
    labId: m.lab.id,
    objective: m.lab.objective,
    checkCount: m.lab.dod.checkCount,
    nodeCount: m.topology.nodes.filter((n) => !n.container && !n.implicit).length,
    flowCount: m.topology.flows.length,
  };
}
