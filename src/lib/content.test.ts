import { describe, expect, it } from "vitest";
import { detectCommands } from "./commands";
import { loadModules, parseModule } from "./content";
import { instrumentDod, parseRunOutput } from "./dod";
import { onesComplement } from "./packet";

const modules = loadModules();
const bySlugPrefix = (n: number) => modules.find((m) => m.meta.order === n)!;

describe("content contract", () => {
  it("parses all six curated modules in order", () => {
    expect(modules.map((m) => m.meta.id)).toEqual(["modulo-01", "modulo-02", "modulo-03", "modulo-04", "modulo-05", "modulo-06"]);
  });

  it("defaults dependencies to the previous module", () => {
    expect(modules[0]!.meta.dependsOn).toEqual([]);
    expect(modules[3]!.meta.dependsOn).toEqual(["modulo-03"]);
  });

  it("resolves book abbreviations from the traceability note", () => {
    expect(bySlugPrefix(2).meta.books[0]!.abbr).toBe("N&K");
    expect(bySlugPrefix(6).meta.books.map((b) => b.abbr)).toEqual(["SD", "ZTN"]);
  });

  it("rejects a module whose blueprint drifts from the schema", () => {
    const raw = `---\nid: "modulo-09"\nslug: "x"\ntitle: "X"\nlayer: "L3"\nprimary_books:\n  - title: "B"\n    chapters: ["c"]\n    target_competencies: ["t"]\ncontent_version: 1\nlab_runtime: "bash"\n---\n# 1. CORE MECHANICS\n\ntexto\n\n# 2. SCHEMATIC & TOPOLOGY BLUEPRINTS\n\n    nodes:\n      a: {cidr: 10.0.0.300/24}\n    flow: "a → b"\n\n# 3. INTERACTIVE LAB SPECIFICATION\n\n# 4. GOTCHAS\n\n- x\n`;
    expect(() => parseModule("modulo-09.md", raw)).toThrow(/nodes\.a\.cidr/);
  });
});

describe("topology", () => {
  it("module 1: routes client → router → server with netfilter stages at the router", () => {
    const t = bySlugPrefix(1).topology;
    const flow = t.flows[0]!;
    expect(flow.hops.map((h) => h.node)).toEqual(["client", "router", "server"]);
    expect(flow.hops[1]!.stages).toEqual(["PREROUTING", "route", "FORWARD", "POSTROUTING"]);
    const client = t.nodes.find((n) => n.id === "client")!;
    expect(client.routes).toContain("default via 10.44.0.1");
    expect(t.nodes.find((n) => n.id === "server")!.listeners[0]).toMatch(/tcp\/8080 · blueprint, nc/);
  });

  it("module 2: builds the bridge chain and recovers the FORWARD policy", () => {
    const t = bySlugPrefix(2).topology;
    expect(t.flows[0]!.hops.map((h) => h.node)).toEqual(["worker", "br-ln2-worker", "host", "br-ln2-api", "api"]);
    const host = t.nodes.find((n) => n.id === "host")!;
    expect(host.rules.filter((r) => r.verdict === "deny").map((r) => r.text)).toEqual(["-A LN2-FORWARD -j DROP"]);
  });

  it("module 4: nests pods in their node by pod CIDR and applies NetworkPolicies", () => {
    const t = bySlugPrefix(4).topology;
    expect(t.nodes.find((n) => n.id === "frontend")!.parent).toBe("node_a");
    expect(t.nodes.find((n) => n.id === "api")!.parent).toBe("node_b");
    const fe = t.nodes.find((n) => n.id === "frontend")!;
    expect(fe.rules.some((r) => r.phase === "setup" && r.verdict === "deny")).toBe(true);
    expect(fe.rules.some((r) => r.phase === "walkthrough" && /TCP\/8080/.test(r.text))).toBe(true);
  });

  it("module 6: resolves subnet names to workloads and keeps denied flows", () => {
    const t = bySlugPrefix(6).topology;
    const denied = t.flows.filter((f) => f.verdict === "deny").map((f) => f.hops.map((h) => h.node));
    expect(denied).toContainEqual(["lb", "db"]);
    expect(t.nodes.find((n) => n.id === "lb")!.parent).toBe("public_edge");
  });

  it("lays out every node inside the canvas", () => {
    for (const m of modules) {
      const { width, height, boxes } = m.topology.layout;
      for (const n of m.topology.nodes) {
        const b = boxes[n.id];
        expect(b, `${m.meta.id}/${n.id}`).toBeDefined();
        expect(b!.x + b!.w).toBeLessThanOrEqual(width);
        expect(b!.y + b!.h).toBeLessThanOrEqual(height);
      }
    }
  });
});

describe("packets", () => {
  it("module 1: SYN from the blueprint, TTL decremented by the router with a valid checksum", () => {
    const p = bySlugPrefix(1).packet!;
    expect(p.captures).toHaveLength(2);
    const [a, b] = p.captures;
    expect(a!.fields.find((f) => f.key === "tcp.sport")!.raw).toBe(40000);
    expect(b!.fields.find((f) => f.key === "ip.ttl")!.raw).toBe(63);
    expect(onesComplement(b!.bytes.slice(0, 20))).toBe(0);
  });

  it("module 4: DNAT rewrites the ClusterIP to the pod", () => {
    const p = bySlugPrefix(4).packet!;
    const after = p.captures[p.captures.length - 1]!;
    expect(after.fields.find((f) => f.key === "ip.dst")!.value).toBe("10.244.2.20");
    expect(after.fields.find((f) => f.key === "ip.dst")!.changed).toBe(true);
  });

  it("module 3: DNS query for the declared record", () => {
    const p = bySlugPrefix(3).packet!;
    expect(p.captures[0]!.fields.find((f) => f.key === "dns.qname")!.value).toBe("api.internal");
  });
});

describe("walkthrough commands", () => {
  it("recovers commands embedded in prose", () => {
    const cmds = detectCommands(
      "Ejecute tcpdump -ni ln1-r1 -vvv 'tcp port 8080' -c 5 y, en otra terminal, ip netns exec ln1-client sh -c 'printf ok | nc -w1 10.45.0.2 8080'.",
    ).map((c) => c.text);
    expect(cmds).toEqual(["tcpdump -ni ln1-r1 -vvv 'tcp port 8080' -c 5", "ip netns exec ln1-client sh -c 'printf ok | nc -w1 10.45.0.2 8080'"]);
  });
});

describe("DoD engine", () => {
  const m1 = bySlugPrefix(1);

  it("flags negated checks that set -e cannot fail", () => {
    expect(m1.lab.dod.lines.some((l) => l.warning)).toBe(true);
  });

  it("instruments every check and parses the markers back", () => {
    const script = instrumentDod(m1.lab.dod, m1.lab.id);
    expect(script.match(/::lnet lab-01-tcp-pcap-state check \d+ pass/g)).toHaveLength(3);
    const run = parseRunOutput(
      "::lnet lab-01-tcp-pcap-state check 0 pass\n::lnet lab-01-tcp-pcap-state check 1 fail\n::lnet lab-01-tcp-pcap-state check 2 pass",
      m1.lab.dod,
      m1.lab.id,
    );
    expect(run.statuses).toEqual(["pass", "fail", "pass"]);
  });

  it("locates the failing check from a bash -x trace", () => {
    const run = parseRunOutput("+ set -euo pipefail\n+ ip -n ln1-client route get 10.45.0.2\n+ grep -q 'via 10.44.0.1'\n+ ip netns exec ln1-server ss -ltn\n+ grep -q :8080", m1.lab.dod, m1.lab.id);
    expect(run.statuses).toEqual(["pass", "fail", "pending"]);
  });
});

describe("Go verifier contract", () => {
  it("parses the JSON report emitted by `lnverify run 6 --json`", async () => {
    const report = (await import("./fixtures-lnverify-lab06.json")).default;
    const m6 = modules.find((m) => m.meta.order === 6)!;
    const run = parseRunOutput(JSON.stringify(report), m6.lab.dod, m6.lab.id);
    expect(run.source).toBe("json");
    expect(run.statuses).toEqual(["pass", "pass", "pass", "pass"]);
  });
});
