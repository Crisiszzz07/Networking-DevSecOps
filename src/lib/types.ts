// Domain types shared by the server-side parser and the client components.
// Everything here must stay JSON-serialisable: modules are parsed at build time
// and handed to client components as props.

export type BookRef = {
  title: string;
  chapters: string[];
  competencies: string[];
  /** Abbreviation used in inline citations, e.g. "PPA" — resolved from the Trazabilidad note. */
  abbr: string | null;
};

export type ModuleMeta = {
  id: string;
  slug: string;
  title: string;
  layer: string;
  order: number;
  contentVersion: number;
  labRuntime: string;
  books: BookRef[];
  dependsOn: string[];
};

export type Theory = {
  /** Raw markdown of the theory section, minus the traceability note. */
  markdown: string;
  trace: string | null;
};

export type CodeBlock = { lang: string | null; value: string };

export type DetectedCommand = { text: string; start: number; end: number };

export type WalkthroughStep = {
  index: number;
  text: string;
  commands: DetectedCommand[];
  /** Sentence that states the expected observable result ("Se espera …"). */
  expectation: string | null;
  code: CodeBlock[];
};

export type DodLineKind = "shebang" | "preamble" | "check" | "pass";

export type DodLine = {
  index: number;
  kind: DodLineKind;
  source: string;
  /** Ordinal among checks (0-based), only for kind === "check". */
  check: number | null;
  describe: string | null;
  warning: string | null;
};

export type DodSpec = {
  script: string;
  passToken: string;
  lines: DodLine[];
  checkCount: number;
};

export type Lab = {
  id: string;
  source: string | null;
  objective: string;
  environment: string;
  setup: CodeBlock;
  walkthrough: WalkthroughStep[];
  dod: DodSpec;
};

export type Gotcha = { text: string };

// ─── Topology ───────────────────────────────────────────────────────────────

export type NodeKind =
  | "netns"
  | "router"
  | "host"
  | "bridge"
  | "segment"
  | "k8s-node"
  | "pod"
  | "service"
  | "workload"
  | "dns"
  | "hook"
  | "map"
  | "collector"
  | "stage"
  | "vpc"
  | "subnet"
  | "external";

export type Iface = { name: string | null; cidr: string; dev: string | null };

export type RulePhase = "blueprint" | "setup" | "walkthrough";

export type NodeRule = { text: string; phase: RulePhase; verdict: "allow" | "deny" | "info" };

export type TopoNode = {
  id: string;
  label: string;
  kind: NodeKind;
  parent: string | null;
  container: boolean;
  ifaces: Iface[];
  props: Record<string, string>;
  routes: string[];
  rules: NodeRule[];
  listeners: string[];
  inspection: string[];
  implicit: boolean;
};

export type LinkKind = "wire" | "route" | "underlay" | "datapath" | "state";

export type TopoLink = { id: string; from: string; to: string; kind: LinkKind; label: string | null };

export type FlowHop = { node: string; stages: string[] };

export type TopoFlow = {
  id: string;
  label: string;
  verdict: "allow" | "deny";
  source: "flow" | "path" | "policy" | "allowed" | "denied";
  hops: FlowHop[];
};

export type Box = { x: number; y: number; w: number; h: number };

export type Topology = {
  nodes: TopoNode[];
  links: TopoLink[];
  flows: TopoFlow[];
  inspection: string[];
  notes: Record<string, string>;
  layout: { width: number; height: number; boxes: Record<string, Box> };
};

// ─── Packets ────────────────────────────────────────────────────────────────

export type HeaderName = "IPv4" | "TCP" | "UDP" | "DNS";

export type PacketField = {
  key: string;
  label: string;
  header: HeaderName;
  /** Bit offset from the start of the packet. */
  bitOffset: number;
  bitLength: number;
  value: string;
  raw: number;
  changed: boolean;
};

export type CapturePoint = {
  id: string;
  label: string;
  note: string;
  bytes: number[];
  fields: PacketField[];
};

export type PacketTrace = {
  flowLabel: string;
  assumptions: string[];
  captures: CapturePoint[];
};

// ─── Module ─────────────────────────────────────────────────────────────────

export type LearningModule = {
  meta: ModuleMeta;
  theory: Theory;
  blueprintSource: string | null;
  blueprintYaml: string;
  lab: Lab;
  gotchas: Gotcha[];
  topology: Topology;
  packet: PacketTrace | null;
  headers: HeaderName[];
  warnings: string[];
};

export type ModuleSummary = Pick<LearningModule, "meta"> & {
  labId: string;
  objective: string;
  checkCount: number;
  nodeCount: number;
  flowCount: number;
};
