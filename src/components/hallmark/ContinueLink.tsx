"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { doneCount, useProgress } from "@/lib/progress";
import type { ModuleSummary } from "@/lib/types";

/** N9 nav's single CTA: resume at the first module whose DoD is not complete. */
export function ContinueLink({ modules }: { modules: ModuleSummary[] }) {
  const progress = useProgress();
  const next = modules.find((m) => doneCount(progress[m.labId], m.checkCount) < m.checkCount);
  const started = modules.some((m) => doneCount(progress[m.labId], m.checkCount) > 0);
  if (!next) {
    return <span className="label-mono whitespace-nowrap">Roadmap completo</span>;
  }
  return (
    <Link href={`/modules/${next.meta.slug}/`} className="btn btn-primary">
      {started ? "Continuar" : "Empezar"} · {next.meta.id.replace("modulo-", "M")}
      <ArrowRight size={16} aria-hidden />
    </Link>
  );
}
