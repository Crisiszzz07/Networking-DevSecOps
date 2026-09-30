"use client";

import { Layers } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { solvedCheckpoints, useUnderstood } from "@/lib/progress";
import { shelf, useReview, type CardKey } from "@/lib/review";

/** Header entry to the review shelf, with today's due count once there is one. */
export function ReviewLink({ keys }: { keys: CardKey[] }) {
  const understood = useUnderstood();
  const review = useReview();
  const [ctx, setCtx] = useState<{ now: Date; solved: string[] } | null>(null);
  useEffect(() => setCtx({ now: new Date(), solved: solvedCheckpoints() }), []);
  const due = ctx ? shelf(keys, understood, ctx.solved, review, ctx.now).due : 0;
  return (
    <Link href="/repaso/" className="btn btn-ghost" aria-label={due ? `Repaso: ${due} tarjetas para hoy` : "Repaso"}>
      <Layers size={16} aria-hidden />
      <span className="max-sm:sr-only">Repaso</span>
      {due > 0 && <span className="review-badge tabular-nums">{due}</span>}
    </Link>
  );
}
