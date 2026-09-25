"use client";

import { Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Topology, TopoNode } from "@/lib/types";
import { flowPath, linkPath } from "./geometry";
import { KIND, LINK_LABEL } from "./kinds";
import { NodeInspector } from "./NodeInspector";

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

function subtitle(n: TopoNode): string {
  if (n.kind === "stage") return KIND.stage.label;
  const iface = n.ifaces[0];
  if (iface) return iface.dev && n.kind !== "bridge" ? `${iface.dev} ${iface.cidr}` : iface.cidr;
  if (n.listeners[0]) return n.listeners[0].split(" · ")[0]!;
  const first = Object.entries(n.props)[0];
  return first ? `${first[0]}: ${first[1]}` : KIND[n.kind].label;
}

export function TopologyExplorer({ topology }: { topology: Topology }) {
  const { nodes, links, flows, layout } = topology;
  const [selected, setSelected] = useState<string | null>(null);
  const [flowId, setFlowId] = useState<string | null>(flows[0]?.id ?? null);
  const [run, setRun] = useState(0);
  const reduce = useReducedMotion();

  const flow = flows.find((f) => f.id === flowId) ?? null;
  const onPath = useMemo(() => new Set(flow?.hops.map((h) => h.node) ?? []), [flow]);
  const fp = useMemo(() => {
    if (!flow) return null;
    const boxes = flow.hops.map((h) => layout.boxes[h.node]).filter((b) => b !== undefined);
    return flowPath(boxes);
  }, [flow, layout.boxes]);

  const node = selected ? nodes.find((n) => n.id === selected) ?? null : null;
  const containers = nodes.filter((n) => n.container);
  const leaves = nodes.filter((n) => !n.container);
  const kindsPresent = [...new Set(links.map((l) => l.kind))];
  const dur = Math.max(1.4, (flow?.hops.length ?? 2) * 0.55);
  const last = flow ? flow.hops[flow.hops.length - 1] : null;

  function pickFlow(id: string) {
    setFlowId(id);
    setRun((r) => r + 1);
  }

  return (
    <div className="grid gap-lg xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-xs" role="radiogroup" aria-label="Flujos del blueprint">
          {flows.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={f.id === flowId}
              onClick={() => pickFlow(f.id)}
              className={`btn btn-xs max-w-full ${f.id === flowId ? (f.verdict === "deny" ? "border-deny text-deny" : "border-accent text-accent") : ""}`}
            >
              <span aria-hidden>{f.verdict === "deny" ? "✕" : "→"}</span>
              <span className="truncate font-mono font-normal">{f.label}</span>
            </button>
          ))}
          {flow && !reduce && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setRun((r) => r + 1)}>
              <Play size={12} aria-hidden />
              Repetir paquete
            </button>
          )}
        </div>

        <div className="mt-md overflow-x-auto rounded-md border border-rule bg-paper-0" onKeyDown={(e) => e.key === "Escape" && setSelected(null)}>
          <svg
            className="topo-svg mx-auto"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width="100%"
            style={{ minWidth: Math.min(layout.width, 640), maxWidth: layout.width * 1.15 }}
            role="group"
            aria-label="Topología del laboratorio"
          >
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-neutral" />
              </marker>
            </defs>

            {containers.map((c) => {
              const b = layout.boxes[c.id];
              if (!b) return null;
              return (
                <g key={c.id}>
                  <rect
                    className="topo-container cursor-pointer"
                    data-kind={c.kind}
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    rx={10}
                    onClick={() => setSelected(c.id)}
                  />
                  <text className="topo-sub" x={b.x + 12} y={b.y + 20}>
                    <tspan className="topo-text" fontWeight={600}>
                      {c.label}
                    </tspan>
                    {c.ifaces[0] ? `  ${c.ifaces[0].cidr}` : ""}
                  </text>
                </g>
              );
            })}

            {links.map((l) => {
              const a = layout.boxes[l.from];
              const b = layout.boxes[l.to];
              if (!a || !b) return null;
              const dim = selected !== null && l.from !== selected && l.to !== selected;
              return (
                <path
                  key={l.id}
                  className="topo-link"
                  data-kind={l.kind}
                  data-dim={dim}
                  d={linkPath(a, b)}
                  markerEnd={l.kind === "datapath" || l.kind === "state" ? "url(#arrow)" : undefined}
                >
                  <title>{`${l.from} ↔ ${l.to}${l.label ? ` · ${l.label}` : ""}`}</title>
                </path>
              );
            })}

            {fp && flow && <path className="topo-flow" data-verdict={flow.verdict} d={fp.d} />}

            {leaves.map((n) => {
              const b = layout.boxes[n.id];
              if (!b) return null;
              const { Icon } = KIND[n.kind];
              const hop = flow?.hops.find((h) => h.node === n.id);
              const dim = selected !== null && selected !== n.id && !links.some((l) => (l.from === selected && l.to === n.id) || (l.to === selected && l.from === n.id));
              return (
                <g
                  key={n.id}
                  className="topo-node"
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === n.id}
                  aria-label={`${KIND[n.kind].label} ${n.label}`}
                  data-selected={selected === n.id}
                  data-onpath={onPath.has(n.id)}
                  data-implicit={n.implicit}
                  data-dim={dim}
                  onClick={() => setSelected(selected === n.id ? null : n.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(selected === n.id ? null : n.id);
                    }
                  }}
                >
                  <rect className="focus" x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} rx={11} fill="none" />
                  <rect className="body" x={b.x} y={b.y} width={b.w} height={b.h} rx={8} />
                  <Icon x={b.x + 12} y={b.y + 13} width={16} height={16} className="text-accent" aria-hidden />
                  <text className="topo-text" x={b.x + 36} y={b.y + 26}>
                    {n.label.length > 17 ? n.label.slice(0, 16) + "…" : n.label}
                  </text>
                  <text className="topo-sub" x={b.x + 12} y={b.y + 50}>
                    {(() => {
                      const s = subtitle(n);
                      return s.length > 24 ? s.slice(0, 23) + "…" : s;
                    })()}
                  </text>
                  {hop && hop.stages.length > 0 && (
                    <text className="topo-stage" x={b.x + b.w / 2} y={b.y - 9} textAnchor="middle">
                      {hop.stages.join(" → ")}
                    </text>
                  )}
                </g>
              );
            })}

            {fp && flow && (
              <g key={`${flow.id}-${run}`} aria-hidden>
                {reduce ? (
                  <circle className="topo-packet" data-verdict={flow.verdict} r={6} cx={fp.end.x} cy={fp.end.y} />
                ) : (
                  <circle className="topo-packet" data-verdict={flow.verdict} r={6}>
                    <animateMotion
                      dur={`${dur}s`}
                      fill="freeze"
                      path={fp.d}
                      calcMode="spline"
                      keyPoints="0;1"
                      keyTimes="0;1"
                      keySplines="0.65 0 0.35 1"
                    />
                  </circle>
                )}
                {flow.verdict === "deny" && last && (
                  <g transform={`translate(${fp.end.x} ${fp.end.y})`} className="text-deny">
                    <circle r={11} className="fill-paper stroke-deny" strokeWidth={2} />
                    <path d="M -4.5 -4.5 L 4.5 4.5 M 4.5 -4.5 L -4.5 4.5" className="stroke-deny" strokeWidth={2.2} strokeLinecap="round" />
                  </g>
                )}
              </g>
            )}
          </svg>
        </div>

        <ul className="mt-sm flex flex-wrap gap-x-lg gap-y-2xs label-mono" aria-label="Leyenda">
          {kindsPresent.map((k) => (
            <li key={k} className="flex items-center gap-xs">
              <svg width="28" height="8" aria-hidden>
                <path className="topo-link" data-kind={k} d="M 0 4 L 28 4" />
              </svg>
              {LINK_LABEL[k]}
            </li>
          ))}
          {flows.some((f) => f.verdict === "allow") && (
            <li className="flex items-center gap-xs">
              <svg width="28" height="8" aria-hidden>
                <path className="topo-flow" data-verdict="allow" d="M 0 4 L 28 4" />
              </svg>
              flujo permitido
            </li>
          )}
          {flows.some((f) => f.verdict === "deny") && (
            <li className="flex items-center gap-xs">
              <svg width="28" height="8" aria-hidden>
                <path className="topo-flow" data-verdict="deny" d="M 0 4 L 28 4" />
              </svg>
              flujo denegado
            </li>
          )}
        </ul>
      </div>

      <aside className="min-w-0 rounded-md border border-rule bg-paper-2 p-md xl:sticky xl:top-md xl:self-start" aria-live="polite">
        {node ? (
          <NodeInspector node={node} topology={topology} onClose={() => setSelected(null)} />
        ) : (
          <div className="grid gap-md text-sm">
            <p className="text-muted">
              Selecciona un nodo (clic, o Tab + Enter) para ver interfaces, rutas, reglas de firewall y listeners
              reconstruidos del blueprint y del script de setup.
            </p>
            {flow && (
              <div className="border-t border-rule pt-sm">
                <p className="label-mono">Flujo activo</p>
                <ol className="mt-xs grid gap-2xs font-mono text-xs">
                  {flow.hops.map((h, i) => (
                    <li key={`${h.node}-${i}`} className="text-ink">
                      <span className="text-neutral">{String(i + 1).padStart(2, "0")} </span>
                      {nodes.find((n) => n.id === h.node)?.label ?? h.node}
                      {h.stages.length > 0 && <span className="block pl-lg text-accent">{h.stages.join(" → ")}</span>}
                    </li>
                  ))}
                </ol>
                {flow.verdict === "deny" && <p className="mt-xs text-xs text-deny">✕ Debe ser rechazado en el destino.</p>}
              </div>
            )}
            {Object.entries(topology.notes).map(([k, v]) => (
              <div key={k} className="border-t border-rule pt-sm">
                <p className="label-mono">{k}</p>
                <p className="mt-2xs text-ink">{v}</p>
              </div>
            ))}
            {topology.inspection.length > 0 && (
              <div className="border-t border-rule pt-sm">
                <p className="label-mono">Inspección global</p>
                <ul className="mt-xs grid gap-2xs font-mono text-xs text-accent">
                  {topology.inspection.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
