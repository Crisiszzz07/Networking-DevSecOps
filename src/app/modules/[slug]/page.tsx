import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DodAudit } from "@/components/lab/DodAudit";
import { LabWorkbench } from "@/components/lab/LabWorkbench";
import { TerminalPanel } from "@/components/lab/TerminalPanel";
import { TheoryPanel } from "@/components/lab/TheoryPanel";
import { PacketInspector } from "@/components/packet/PacketInspector";
import { TopologyExplorer } from "@/components/topology/TopologyExplorer";
import { getModule, loadModules } from "@/lib/content";
import { conceptsIn } from "@/lib/glossary";
import { MiniConstellation } from "@/components/sky/MiniConstellation";
import { signatureFor, subnetFor } from "@/lib/names";
import { buildSky } from "@/lib/sky";
import { checkpointFor } from "@/lib/checkpoints";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return loadModules().map((m) => ({ slug: m.meta.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const m = getModule((await params).slug);
  return m ? { title: m.meta.title, description: m.lab.objective } : {};
}

export default async function ModulePage({ params }: Params) {
  const m = getModule((await params).slug);
  if (!m) notFound();
  const all = loadModules();
  const idx = all.findIndex((x) => x.meta.id === m.meta.id);
  const prev = all[idx - 1];
  const next = all[idx + 1];
  const t = m.topology;
  const checkpoint = checkpointFor(m.meta.id);
  const realNodes = t.nodes.filter((n) => !n.container && !n.implicit).length;
  const hue = { ["--h" as string]: `var(--hue-${(idx % 6) + 1})` } as React.CSSProperties;

  return (
    <div className="hue px-gutter" style={hue}>
      <header className="module-hero grid gap-lg pt-md pb-xl lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <Link href="/" className="link-quiet inline-flex items-center gap-2xs text-sm">
            <ArrowLeft size={14} aria-hidden />
            Roadmap
          </Link>
          <p className="module-eyebrow mt-md">
            <span className="tok-prompt">$</span> ssh {m.lab.id}
            <span className="module-eyebrow-sep">·</span>
            {m.meta.id.replace("modulo-", "M")} · {m.meta.layer}
          </p>
          <h1 className="module-title mt-xs max-w-[24ch]">{m.meta.title}</h1>
          <p className="module-sig mt-sm">
            <span className="text-signal">{subnetFor(idx)}</span>
            <span aria-hidden> · </span>
            {signatureFor(idx)}
          </p>
          <p className="mt-md max-w-[60ch] text-md text-muted">
            <span className="text-ink">Objetivo:</span> {m.lab.objective}
          </p>
          <p className="mt-xs label-mono">Runtime: {m.meta.labRuntime}</p>
        </div>
        <div className="grid gap-md lg:justify-items-end">
          <MiniConstellation sky={buildSky(all)} moduleId={m.meta.id} />
        <nav aria-label="Módulos adyacentes" className="flex flex-wrap gap-xs">
          {prev && (
            <Link href={`/modules/${prev.meta.slug}/`} className="btn btn-ghost">
              <ArrowLeft size={15} aria-hidden />
              {prev.meta.id.replace("modulo-", "M")}
            </Link>
          )}
          {next && (
            <Link href={`/modules/${next.meta.slug}/`} className="btn">
              {next.meta.id.replace("modulo-", "M")}
              <ArrowRight size={15} aria-hidden />
            </Link>
          )}
        </nav>
        </div>
      </header>

      <p className="orn-rule mb-xl" aria-hidden>
        ◇
      </p>

      <LabWorkbench
        labId={m.lab.id}
        checkCount={m.lab.dod.checkCount}
        meta={{
          fundamentos: `${m.meta.books.length} fuente${m.meta.books.length > 1 ? "s" : ""} · ${m.gotchas.length} trampas`,
          topologia: `${realNodes} nodos · ${t.flows.length} flujos`,
          terminal: `setup + ${m.lab.walkthrough.length} pasos`,
        }}
        panels={{
          fundamentos: (
            <TheoryPanel
              markdown={m.theory.markdown}
              trace={m.theory.trace}
              books={m.meta.books}
              gotchas={m.gotchas}
              concepts={conceptsIn(m.theory.markdown + "\n" + m.gotchas.map((g) => g.text).join("\n"))}
              checkpoint={checkpoint}
              after={m.packet ? <PacketInspector trace={m.packet} /> : null}
            />
          ),
          topologia: (
            <div className="grid gap-md">
              <TopologyExplorer topology={t} />
              {m.blueprintSource && <p className="label-mono">Blueprint · {m.blueprintSource}</p>}
            </div>
          ),
          terminal: <TerminalPanel lab={m.lab} />,
          dod: <DodAudit labId={m.lab.id} dod={m.lab.dod} />,
        }}
      />

      {m.warnings.length > 0 && (
        <details className="author-notes">
          <summary>
            Notas del autor · calidad del contenido
            <span>{m.warnings.length} aviso{m.warnings.length > 1 ? "s" : ""}</span>
          </summary>
          <p>
            Estas observaciones revisan la consistencia de los materiales y scripts de verificación; no son pasos del
            laboratorio ni indican un error de tu entorno.
          </p>
          <ul>
            {m.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
