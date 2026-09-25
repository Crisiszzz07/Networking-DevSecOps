import { CircleCheck, CircleX, Info, X } from "lucide-react";
import { addressCount, parseCidr } from "@/lib/cidr";
import type { NodeRule, Topology, TopoNode } from "@/lib/types";
import { KIND } from "./kinds";

const PHASE: Record<NodeRule["phase"], string> = { blueprint: "blueprint", setup: "setup", walkthrough: "walkthrough" };

function RuleGlyph({ verdict }: { verdict: NodeRule["verdict"] }) {
  if (verdict === "allow") return <CircleCheck size={15} className="mt-[3px] shrink-0 text-allow" aria-label="permite" />;
  if (verdict === "deny") return <CircleX size={15} className="mt-[3px] shrink-0 text-deny" aria-label="deniega" />;
  return <Info size={15} className="mt-[3px] shrink-0 text-neutral" aria-label="informativa" />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule pt-sm">
      <h4 className="label-mono font-normal tracking-normal">{title}</h4>
      <div className="mt-xs">{children}</div>
    </section>
  );
}

export function NodeInspector({ node, topology, onClose }: { node: TopoNode; topology: Topology; onClose: () => void }) {
  const { label, Icon } = KIND[node.kind];
  const children = topology.nodes.filter((n) => n.parent === node.id);
  const flows = topology.flows.filter((f) => f.hops.some((h) => h.node === node.id));
  const props = Object.entries(node.props);

  return (
    <div className="grid gap-md">
      <div className="flex items-start justify-between gap-sm">
        <div className="min-w-0">
          <p className="flex items-center gap-xs label-mono">
            <Icon size={14} aria-hidden />
            {label}
            {node.implicit && " · inferido del flujo"}
          </p>
          <h3 className="mt-2xs font-mono text-md font-semibold tracking-normal">{node.label}</h3>
          {node.parent && <p className="text-sm text-neutral">dentro de {node.parent}</p>}
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Cerrar inspector">
          <X size={14} aria-hidden />
        </button>
      </div>

      {node.ifaces.length > 0 && (
        <Section title={node.container ? "Rango" : "Interfaces"}>
          <table className="w-full font-mono text-xs">
            <tbody>
              {node.ifaces.map((i) => {
                const c = parseCidr(i.cidr);
                return (
                  <tr key={i.cidr} className="align-top">
                    <td className="py-2xs pr-sm text-neutral">{i.dev ?? i.name ?? "—"}</td>
                    <td className="py-2xs text-ink">
                      {i.cidr}
                      {node.container && c?.prefix != null && (
                        <span className="block text-neutral">{addressCount(c.prefix).toLocaleString("es")} direcciones</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {node.listeners.length > 0 && (
        <Section title="Escuchando">
          <ul className="grid gap-2xs font-mono text-xs text-ink">
            {node.listeners.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Section>
      )}

      {node.routes.length > 0 && (
        <Section title="Tabla de rutas (setup)">
          <ul className="grid gap-2xs font-mono text-xs text-ink">
            {node.routes.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {node.rules.length > 0 && (
        <Section title="Política y firewall">
          <ul className="grid gap-xs">
            {node.rules.map((r, i) => (
              <li key={i} className="flex gap-xs text-xs">
                <RuleGlyph verdict={r.verdict} />
                <span className="min-w-0 font-mono break-words text-ink">
                  {r.text}
                  <span className="ml-xs text-neutral">[{PHASE[r.phase]}]</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {children.length > 0 && (
        <Section title="Contiene">
          <p className="font-mono text-xs text-ink">{children.map((c) => c.label).join(" · ")}</p>
        </Section>
      )}

      {props.length > 0 && (
        <Section title="Propiedades">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-sm gap-y-2xs font-mono text-xs">
            {props.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-neutral">{k}</dt>
                <dd className="break-words text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {node.inspection.length > 0 && (
        <Section title="Qué inspeccionar aquí">
          <ul className="grid gap-2xs font-mono text-xs text-accent">
            {node.inspection.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Section>
      )}

      {flows.length > 0 && (
        <Section title="Flujos que lo atraviesan">
          <ul className="grid gap-2xs text-xs text-muted">
            {flows.map((f) => (
              <li key={f.id} className={f.verdict === "deny" ? "text-deny" : undefined}>
                {f.verdict === "deny" ? "✕ " : "→ "}
                {f.label}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
