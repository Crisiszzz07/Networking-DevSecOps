import * as yaml from "js-yaml";
import { contains, networkOf, parseCidr } from "./cidr";
import { layoutTopology } from "./layout";
import type { Blueprint, NodeSpec } from "./schema";
import type {
  FlowHop,
  Iface,
  LinkKind,
  NodeKind,
  NodeRule,
  RulePhase,
  TopoFlow,
  TopoLink,
  TopoNode,
  Topology,
} from "./types";

// Turns the free-form blueprint of a module (section 2) plus its lab scripts into
// a graph: nodes, wires derived from shared subnets, containment derived from
// CIDR ranges, flows resolved against node names, and per-node state (routes,
// firewall rules, listeners) recovered from the setup script.

type Draft = TopoNode & { listenerSources: Map<string, Set<string>> };

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function inferKind(spec: NodeSpec): NodeKind {
  if (spec.pod_cidr) return "k8s-node";
  if (spec.type) return "service";
  if (spec.labels) return "pod";
  if (spec.bridges) return "host";
  if (spec.forwarding || (spec.interfaces && spec.interfaces.length > 1)) return "router";
  if (spec.netns) return "netns";
  if (spec.record) return "dns";
  if (typeof spec.id === "string" && spec.id.startsWith("spiffe://")) return "workload";
  if ("action" in spec || "context" in spec) return "hook";
  if ("key" in spec && "value" in spec) return "map";
  if ("input" in spec) return "collector";
  return "workload";
}

function splitNamed(v: string): { name: string; cidr: string } {
  const [name, cidr] = v.split("=");
  return { name: name!, cidr: cidr! };
}

function newNode(id: string, kind: NodeKind, extra: Partial<TopoNode> = {}): Draft {
  return {
    id,
    label: id,
    kind,
    parent: null,
    container: kind === "k8s-node" || kind === "vpc" || kind === "subnet",
    ifaces: [],
    props: {},
    routes: [],
    rules: [],
    listeners: [],
    inspection: [],
    implicit: false,
    listenerSources: new Map(),
    ...extra,
  };
}

function addListener(n: Draft, key: string, source: string) {
  const set = n.listenerSources.get(key) ?? new Set<string>();
  set.add(source);
  n.listenerSources.set(key, set);
}

function ipOf(n: TopoNode): number | null {
  for (const i of n.ifaces) {
    const c = parseCidr(i.cidr);
    if (c) return c.ip;
  }
  return null;
}

// ─── Flow token resolution ──────────────────────────────────────────────────

const KIND_WORDS: Partial<Record<NodeKind, { words: string[]; weight: number }>> = {
  bridge: { words: ["bridge", "br"], weight: 2 },
  netns: { words: ["veth", "netns"], weight: 1 },
  service: { words: ["service", "vip"], weight: 2 },
};

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function score(node: TopoNode, ws: string[]): number {
  let total = 0;
  const id = node.id.toLowerCase();
  const parts = id.split(/[-_]/);
  const values = Object.values(node.props).map((v) => v.toLowerCase());
  const kw = KIND_WORDS[node.kind];
  for (const w of ws) {
    if (w === id) total += 3;
    else if (parts.includes(w)) total += 2;
    if (w.length >= 3 && values.includes(w)) total += 2;
    if (kw?.words.includes(w)) total += kw.weight;
  }
  return total;
}

function resolveToken(token: string, nodes: Draft[]): Draft | null {
  const ws = words(token);
  let best: Draft | null = null;
  let bestScore = 1;
  for (const n of nodes) {
    if (n.kind === "segment" || n.kind === "vpc") continue;
    const s = score(n, ws);
    if (s > bestScore) {
      best = n;
      bestScore = s;
    }
  }
  if (best?.kind === "subnet") {
    // A subnet name in a flow ("edge", "app") stands for the workload it hosts.
    const child = nodes.find((c) => c.parent === best!.id && !c.container);
    return child ?? best;
  }
  return best;
}

function bfs(from: string, to: string, links: TopoLink[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const l of links) {
    if (l.kind === "state" || l.kind === "datapath") continue;
    adj.set(l.from, [...(adj.get(l.from) ?? []), l.to]);
    adj.set(l.to, [...(adj.get(l.to) ?? []), l.from]);
  }
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const nxt of adj.get(cur) ?? []) {
      if (!prev.has(nxt)) {
        prev.set(nxt, cur);
        queue.push(nxt);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: string[] = [];
  for (let c: string | null = to; c !== null; c = prev.get(c) ?? null) path.unshift(c);
  return path;
}

// ─── Script analysis ────────────────────────────────────────────────────────

function splitCommands(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
    } else if (ch === ";" || (ch === "|" && line[i + 1] === "|") || (ch === "&" && line[i + 1] === "&")) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      if (ch !== ";") i++;
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Extract heredoc bodies (`<<'YAML' … YAML`) and the remaining plain lines. */
function splitHeredocs(script: string): { lines: string[]; docs: string[] } {
  const lines: string[] = [];
  const docs: string[] = [];
  const src = script.split("\n");
  for (let i = 0; i < src.length; i++) {
    const line = src[i]!;
    const m = line.match(/<<-?\s*'?(\w+)'?/);
    if (!m) {
      lines.push(line);
      continue;
    }
    lines.push(line.slice(0, m.index));
    const body: string[] = [];
    for (i++; i < src.length && src[i]!.trim() !== m[1]; i++) body.push(src[i]!);
    docs.push(body.join("\n"));
  }
  return { lines, docs };
}

const describeSelector = (sel: unknown): string => {
  const ml = (sel as { matchLabels?: Record<string, string> } | undefined)?.matchLabels;
  if (!ml || Object.keys(ml).length === 0) return "todos";
  return Object.entries(ml)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
};

type Peer = { podSelector?: unknown; namespaceSelector?: unknown; ipBlock?: { cidr: string } };
type PortSpec = { protocol?: string; port?: number | string };
type PolicyRule = { to?: Peer[]; from?: Peer[]; ports?: PortSpec[] };
type NetworkPolicy = {
  kind?: string;
  metadata?: { name?: string };
  spec?: {
    podSelector?: { matchLabels?: Record<string, string> };
    policyTypes?: string[];
    ingress?: PolicyRule[];
    egress?: PolicyRule[];
  };
};

function describePeers(peers: Peer[] | undefined): string {
  if (!peers?.length) return "cualquier origen";
  return peers
    .map((p) => {
      const bits: string[] = [];
      if (p.namespaceSelector) bits.push(`ns ${describeSelector(p.namespaceSelector)}`);
      if (p.podSelector) bits.push(`pods ${describeSelector(p.podSelector)}`);
      if (p.ipBlock) bits.push(p.ipBlock.cidr);
      return bits.join(" + ");
    })
    .join(" | ");
}

const describePorts = (ports: PortSpec[] | undefined) =>
  ports?.length ? ports.map((p) => `${(p.protocol ?? "TCP").toUpperCase()}/${p.port ?? "*"}`).join(", ") : "todos los puertos";

function applyNetworkPolicy(doc: NetworkPolicy, pods: Draft[], phase: RulePhase) {
  const name = doc.metadata?.name ?? "policy";
  const ml = doc.spec?.podSelector?.matchLabels ?? {};
  const targets = pods.filter((p) => {
    const entries = Object.entries(ml);
    if (!entries.length) return true;
    // `kubectl run X` labels the pod run=X; blueprint labels live in props.labels.
    return entries.every(([k, v]) => p.id === v || (p.props.labels ?? "").split(", ").includes(`${k}=${v}`));
  });
  for (const pod of targets) {
    for (const type of doc.spec?.policyTypes ?? []) {
      const rules = type === "Egress" ? doc.spec?.egress : doc.spec?.ingress;
      if (!rules?.length) {
        pod.rules.push({ text: `${type}: denegar todo por defecto · ${name}`, phase, verdict: "deny" });
        continue;
      }
      for (const r of rules) {
        const peers = type === "Egress" ? r.to : r.from;
        const arrow = type === "Egress" ? "→" : "←";
        pod.rules.push({
          text: `${type} ${arrow} ${describePeers(peers)} · ${describePorts(r.ports)} · ${name}`,
          phase,
          verdict: "allow",
        });
      }
    }
  }
}

function iptablesVerdict(cmd: string): NodeRule["verdict"] {
  const j = cmd.match(/-j\s+(\S+)/)?.[1];
  if (j === "ACCEPT") return "allow";
  if (j === "DROP" || j === "REJECT") return "deny";
  return "info";
}

function analyseScript(script: string, phase: RulePhase, nodes: Draft[], forwarder: Draft | null) {
  const byNetns = new Map(nodes.filter((n) => n.props.netns).map((n) => [n.props.netns!, n]));
  const pods = nodes.filter((n) => n.kind === "pod");
  const { lines, docs } = splitHeredocs(script);

  for (const doc of docs) {
    try {
      for (const d of yaml.loadAll(doc) as NetworkPolicy[]) {
        if (d?.kind === "NetworkPolicy") applyNetworkPolicy(d, pods, phase);
      }
    } catch {
      /* not YAML — ignore */
    }
  }

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("for ") || t.startsWith("set ")) continue;
    for (const cmd of splitCommands(t)) {
      let target: Draft | null = forwarder;
      let rest = cmd;
      const nsFlag = cmd.match(/^ip -n (\S+) (.*)$/);
      const nsExec = cmd.match(/^ip netns exec (\S+) (.*)$/);
      if (nsFlag) {
        target = byNetns.get(nsFlag[1]!) ?? null;
        rest = `ip ${nsFlag[2]}`;
      } else if (nsExec) {
        target = byNetns.get(nsExec[1]!) ?? null;
        rest = nsExec[2]!;
      }

      const route = rest.match(/^ip route add (.+)$/);
      if (route && target) {
        target.routes.push(route[1]!);
        continue;
      }
      const addr = rest.match(/^ip addr add (\S+) dev (\S+)/);
      if (addr) {
        const owner =
          target && target.ifaces.some((i) => i.cidr === addr[1])
            ? target
            : nodes.find((n) => n.ifaces.some((i) => i.cidr === addr[1]));
        const iface = owner?.ifaces.find((i) => i.cidr === addr[1]);
        if (iface) iface.dev = addr[2]!;
        continue;
      }
      const sysctl = rest.match(/^sysctl -\w*w\s+(\S+)=(\S+)/);
      if (sysctl && target) {
        target.props[sysctl[1]!] = sysctl[2]!;
        continue;
      }
      if (/^iptables /.test(rest) && target) {
        if (/ -[CF] /.test(rest)) continue;
        const text = rest.replace(/^iptables\s+/, "").replace(/\s*2>\/dev\/null$/, "");
        target.rules.push({ text: /^-N /.test(text) ? `cadena ${text.slice(3)}` : text, phase, verdict: iptablesVerdict(text) });
        continue;
      }
      const ncListen = rest.match(/nc -l\w*(?:\s+-\w+)*\s+-p\s+(\d+)/);
      if (ncListen && target && target !== forwarder) {
        addListener(target, `tcp/${ncListen[1]}`, "nc");
        continue;
      }
      const accept = rest.match(/(?:-accept|-listen=:?|--port=)\s*(\d+)/);
      const run = rest.match(/^kubectl .*\brun (\S+)/);
      if (run) {
        const pod = nodes.find((n) => n.id === run[1]);
        if (pod) {
          pod.props.run = run[1]!;
          const image = rest.match(/--image=(\S+)/)?.[1];
          if (image) pod.props.image = image;
          if (accept) addListener(pod, `tcp/${accept[1]}`, image?.split("/").pop() ?? "kubectl run");
        }
        continue;
      }
      const expose = rest.match(/^kubectl .*\bexpose \S+ (\S+).*--port=(\d+)(?:.*--target-port=(\d+))?/);
      if (expose) {
        const svc = nodes.find((n) => n.kind === "service");
        if (svc) {
          svc.props.port = expose[2]!;
          svc.rules.push({ text: `selector → pod ${expose[1]} · ${expose[2]}→${expose[3] ?? expose[2]}`, phase, verdict: "info" });
        }
        continue;
      }
      if (accept && /openssl s_server/.test(rest)) {
        const port = accept[1]!;
        const owner = nodes.find((n) => n.listenerSources.has(`tcp/${port}`));
        if (owner) addListener(owner, `tcp/${port}`, /-Verify/.test(rest) ? "openssl s_server · mTLS" : "openssl s_server");
      }
    }
  }
}

// ─── Builder ────────────────────────────────────────────────────────────────

export type TopologyInput = { blueprint: Blueprint; setup: string; walkthroughCode: string[] };

export function buildTopology({ blueprint: bp, setup, walkthroughCode }: TopologyInput): Topology {
  const nodes: Draft[] = [];
  const links: TopoLink[] = [];
  const notes: Record<string, string> = {};
  const byId = (id: string) => nodes.find((n) => n.id === id);
  const link = (from: string, to: string, kind: LinkKind, label: string | null = null) => {
    if (links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from))) return;
    links.push({ id: `${from}~${to}`, from, to, kind, label });
  };

  // 1 · Explicit nodes.
  for (const [id, spec] of Object.entries(bp.nodes ?? {})) {
    const n = newNode(id, inferKind(spec));
    const ifaces: Iface[] = [];
    if (spec.cidr) ifaces.push({ name: null, cidr: spec.cidr, dev: null });
    if (spec.ip) ifaces.push({ name: null, cidr: spec.ip, dev: null });
    for (const v of spec.interfaces ?? []) {
      const { name, cidr } = splitNamed(v);
      ifaces.push({ name, cidr, dev: null });
    }
    n.ifaces = ifaces;
    for (const [k, v] of Object.entries(spec)) {
      if (k === "interfaces" || k === "bridges" || k === "cidr" || k === "ip") continue;
      if (k === "labels") n.props.labels = Object.entries(v as Record<string, string>).map(([a, b]) => `${a}=${b}`).join(", ");
      else n.props[k] = String(v);
    }
    if (spec.pod_cidr) n.ifaces = [{ name: "pod CIDR", cidr: spec.pod_cidr, dev: null }];
    if (spec.listen) addListener(n, spec.listen.toLowerCase(), "blueprint");
    else if (spec.port) addListener(n, `tcp/${spec.port}`, "blueprint");
    nodes.push(n);

    for (const v of spec.bridges ?? []) {
      const { name, cidr } = splitNamed(v);
      nodes.push(newNode(name, "bridge", { ifaces: [{ name, cidr, dev: name }] }));
      link(name, id, "route", "gateway");
    }
  }

  // 2 · Cloud VPC / subnets.
  if (bp.vpc) nodes.push(newNode("vpc", "vpc", { label: "VPC", ifaces: [{ name: null, cidr: bp.vpc.cidr, dev: null }] }));
  for (const [id, sn] of Object.entries(bp.subnets ?? {})) {
    nodes.push(newNode(id, "subnet", { parent: bp.vpc ? "vpc" : null, ifaces: [{ name: null, cidr: sn.cidr, dev: null }] }));
    const child = newNode(sn.node, "workload", { parent: id });
    if (sn.ingress) {
      const [from, port] = sn.ingress.includes("→") ? sn.ingress.split("→") : [null, sn.ingress];
      child.rules.push({
        text: from ? `ingress ← ${from.trim()} · tcp/${port!.trim()}` : `ingress ← cualquiera · ${port!.trim()}`,
        phase: "blueprint",
        verdict: "allow",
      });
      child.rules.push({ text: "resto del ingress: denegado (SG stateful)", phase: "blueprint", verdict: "deny" });
    }
    nodes.push(child);
  }

  // 3 · Containment by CIDR (pods inside the node whose pod CIDR holds their IP).
  for (const c of nodes.filter((n) => n.kind === "k8s-node")) {
    const range = parseCidr(c.ifaces[0]!.cidr)!;
    for (const n of nodes) {
      const ip = ipOf(n);
      if (!n.container && n.parent === null && ip !== null && contains(range, ip)) n.parent = c.id;
    }
  }

  // 4 · Wires: nodes whose interfaces share a subnet. Pairs link directly,
  //     three or more hang off an explicit L2 segment.
  const groups = new Map<string, { node: string; iface: Iface }[]>();
  for (const n of nodes) {
    if (n.container) continue;
    for (const iface of n.ifaces) {
      const c = parseCidr(iface.cidr);
      const net = c ? networkOf(c) : null;
      if (!net) continue;
      const g = groups.get(net) ?? [];
      if (!g.some((m) => m.node === n.id)) g.push({ node: n.id, iface });
      groups.set(net, g);
    }
  }
  for (const [net, members] of groups) {
    if (members.length === 2) link(members[0]!.node, members[1]!.node, "wire", net);
    else if (members.length > 2) {
      const seg = `seg-${slug(net)}`;
      nodes.push(newNode(seg, "segment", { label: net, implicit: true, ifaces: [{ name: null, cidr: net, dev: null }] }));
      for (const m of members) link(m.node, seg, "wire", m.iface.name);
    }
  }

  // 5 · Flows.
  const flows: TopoFlow[] = [];
  type RawFlow = { text: string; source: TopoFlow["source"]; verdict: TopoFlow["verdict"] };
  const raw: RawFlow[] = [];
  for (const f of bp.flow === undefined ? [] : Array.isArray(bp.flow) ? bp.flow : [bp.flow]) raw.push({ text: f, source: "flow", verdict: "allow" });
  if (bp.path) raw.push({ text: bp.path, source: "path", verdict: "allow" });
  if (bp.policy) raw.push({ text: bp.policy, source: "policy", verdict: "allow" });
  for (const f of bp.allowed ?? []) raw.push({ text: f, source: "allowed", verdict: "allow" });
  for (const f of bp.denied ?? []) raw.push({ text: f, source: "denied", verdict: "deny" });

  const underlayNotes: string[] = [];
  const resolvedFlows = raw.map((rf, fi) => {
    const [main, ...extra] = rf.text.split(";");
    if (extra.length) underlayNotes.push(extra.join(";").trim());
    const tokens = main!.split(/\s*(?:→|->)\s*/).map((t) => t.trim()).filter(Boolean);
    const seq: { node: Draft | null; token: string }[] = tokens.map((token, i) => {
      let node = resolveToken(token, nodes);
      const endpoint = i === 0 || i === tokens.length - 1;
      if (!node && (rf.source === "path" || endpoint)) {
        const id = slug(token);
        node = byId(id) ?? null;
        if (!node) {
          node = newNode(id, rf.source === "path" ? "stage" : "external", { label: token, implicit: true });
          nodes.push(node);
        }
      }
      return { node, token };
    });
    return { rf, fi, seq };
  });

  // Datapath and state links come from `path` pipelines and hook → map → collector.
  for (const { rf, seq } of resolvedFlows) {
    if (rf.source !== "path") continue;
    for (let i = 1; i < seq.length; i++) link(seq[i - 1]!.node!.id, seq[i]!.node!.id, "datapath", null);
  }
  const maps = nodes.filter((n) => n.kind === "map");
  for (const m of maps) {
    for (const h of nodes.filter((n) => n.kind === "hook")) link(h.id, m.id, "state", "escribe");
    for (const c of nodes.filter((n) => n.kind === "collector")) link(m.id, c.id, "state", c.props.input ?? null);
  }
  const k8sNodes = nodes.filter((n) => n.kind === "k8s-node");
  for (let i = 1; i < k8sNodes.length; i++) {
    link(k8sNodes[i - 1]!.id, k8sNodes[i]!.id, "underlay", underlayNotes[0] ?? "underlay");
  }
  if (underlayNotes.length) notes.underlay = underlayNotes.join(" · ");
  if (bp.enforcement) notes.enforcement = bp.enforcement;

  for (const { rf, fi, seq } of resolvedFlows) {
    const hops: FlowHop[] = [];
    let pending: string[] = [];
    for (const { node, token } of seq) {
      if (!node) {
        pending.push(token);
        continue;
      }
      const prev = hops[hops.length - 1];
      if (!prev) {
        hops.push({ node: node.id, stages: [] });
        continue;
      }
      if (prev.node === node.id) {
        prev.stages.push(...pending, token);
        pending = [];
        continue;
      }
      const path = rf.source === "path" ? null : bfs(prev.node, node.id, links);
      const middle = path && path.length > 2 ? path.slice(1, -1) : [];
      middle.forEach((m, i) => hops.push({ node: m, stages: i === 0 ? pending : [] }));
      hops.push({ node: node.id, stages: middle.length ? [] : pending });
      pending = [];
    }
    flows.push({ id: `f${fi}`, label: rf.text, verdict: rf.verdict, source: rf.source, hops });
  }

  // 6 · State from scripts.
  const forwarder = nodes.find((n) => n.kind === "router" || n.kind === "host") ?? null;
  analyseScript(setup, "setup", nodes, forwarder);
  for (const code of walkthroughCode) analyseScript(code, "walkthrough", nodes, forwarder);

  // 7 · Inspection hints, attached where they name a node, interface or netns.
  const global: string[] = [];
  for (const item of bp.inspection ?? []) {
    const ws = words(item);
    const owners = nodes.filter((n) => {
      if (n.container || n.implicit) return false;
      if (ws.includes(n.id.toLowerCase())) return true;
      if (n.ifaces.some((i) => i.dev && item.includes(i.dev))) return true;
      if (n.props.netns && item.includes(n.props.netns)) return true;
      if (n.kind === "bridge" && ws.includes("bridge")) return true;
      if (n === forwarder && /iptables|forward|conntrack|nft/i.test(item)) return true;
      return false;
    });
    if (owners.length) owners.forEach((o) => o.inspection.push(item));
    else global.push(item);
  }

  const finalNodes: TopoNode[] = nodes.map(({ listenerSources, ...n }) => ({
    ...n,
    listeners: [...listenerSources].map(([k, v]) => `${k} · ${[...v].join(", ")}`),
  }));

  return {
    nodes: finalNodes,
    links,
    flows,
    inspection: global,
    notes,
    layout: layoutTopology(finalNodes, links, flows),
  };
}
