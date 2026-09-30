"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { lessonAnchor } from "@/lib/lessons";
import { doneCount, nextStep, useProgress, useUnderstood } from "@/lib/progress";
import type { ModuleSummary } from "@/lib/types";

/** N9 nav's single CTA: resume at the first lesson not understood, or the first lab not verified. */
export function ContinueLink({ modules }: { modules: ModuleSummary[] }) {
  const progress = useProgress();
  const understood = useUnderstood();
  const tracks = modules.map((m) => ({ ...m, moduleId: m.meta.id }));
  const step = nextStep(tracks, understood, progress);
  const started =
    modules.some((m) => doneCount(progress[m.labId], m.checkCount) > 0) ||
    Object.values(understood).some((lessons) => Object.keys(lessons).length > 0);
  if (!step) {
    return <span className="label-mono whitespace-nowrap">Roadmap completo</span>;
  }
  const { track, lesson } = step;
  return (
    <Link
      href={`/modules/${track.meta.slug}/#${lesson ? lessonAnchor(lesson.id) : "dod"}`}
      className="btn btn-primary"
      title={lesson ? lesson.title : "Auditoría DoD"}
    >
      {started ? "Continuar" : "Empezar"} · {track.meta.id.replace("modulo-", "M")}
      <ArrowRight size={16} aria-hidden />
    </Link>
  );
}
