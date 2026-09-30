"use client";

import { ArrowRight, Check, Eye, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { solvedCheckpoints, useUnderstood } from "@/lib/progress";
import {
  dueAt,
  intervalFor,
  MASTERED_BOX,
  nextBox,
  queue,
  saveRating,
  shelf,
  useReview,
  type Rating,
  type ReviewCard,
} from "@/lib/review";

const RATINGS: { id: Rating; label: string; key: string }[] = [
  { id: "olvidada", label: "No la recordé", key: "1" },
  { id: "esfuerzo", label: "Con esfuerzo", key: "2" },
  { id: "facil", label: "Fácil", key: "3" },
];

const KIND_LABEL: Record<ReviewCard["kind"], string> = { leccion: "Lección", concepto: "Concepto", checkpoint: "Checkpoint" };

const dayFmt = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" });

function inDays(n: number) {
  return n === 1 ? "mañana" : `en ${n} días`;
}

function whenLabel(date: Date, now: Date) {
  const days = Math.round((date.getTime() - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 1 ? "mañana" : days < 7 ? `en ${days} días (${dayFmt.format(date)})` : dayFmt.format(date);
}

function Front({ card }: { card: ReviewCard }) {
  if (card.kind === "leccion") {
    return (
      <>
        <p className="review-ask">Explica con tus palabras</p>
        <h2 className="review-title">{card.title}</h2>
        <p className="review-hint">
          Dilo en voz alta o escríbelo en dos o tres frases antes de mirar: ¿qué problema resuelve y qué evidencia lo
          demuestra?
        </p>
      </>
    );
  }
  if (card.kind === "concepto") {
    return (
      <>
        <h2 className="review-title">{card.term}</h2>
        <p className="review-ask">¿Qué es y por qué importa en seguridad?</p>
      </>
    );
  }
  return (
    <>
      <div className="decision-scenario">
        <p>{card.prompt}</p>
        <pre>{card.observation.join("\n")}</pre>
      </div>
      <p className="review-ask">{card.question}</p>
      <p className="review-hint">Formula tu conclusión antes de revelar; las opciones aparecen con la respuesta.</p>
    </>
  );
}

function Back({ card }: { card: ReviewCard }) {
  return (
    <div className="review-back">
      {card.kind === "leccion" && <p>{card.answer}</p>}
      {card.kind === "concepto" && (
        <>
          <p className="text-ink">{card.short}</p>
          <p>
            <span className="review-label">Por qué importa</span> {card.why}
          </p>
          <p>
            <span className="review-label">Para recordarlo</span> {card.analogy}
          </p>
        </>
      )}
      {card.kind === "checkpoint" && (
        <>
          <ol className="review-options">
            {card.options.map((o, i) => (
              <li key={o.label} data-correct={o.correct}>
                <span>{String.fromCharCode(65 + i)}</span>
                {o.label}
              </li>
            ))}
          </ol>
          <p className="text-ink">{card.title}.</p>
          <p className="decision-takeaway">{card.takeaway}</p>
        </>
      )}
      <Link href={card.href} className="link-quiet inline-flex items-center gap-2xs text-sm">
        Releer en el módulo <ArrowRight size={14} aria-hidden />
      </Link>
    </div>
  );
}

type Tally = Record<Rating, number>;

export function ReviewSession({ deck, modules }: { deck: ReviewCard[]; modules: { id: string; num: string; title: string }[] }) {
  const understood = useUnderstood();
  const review = useReview();
  // Clock and checkpoint list are browser-only: read after mount to keep hydration stable.
  const [now, setNow] = useState<Date | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [session, setSession] = useState<string[] | null>(null);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const [tally, setTally] = useState<Tally>({ olvidada: 0, esfuerzo: 0, facil: 0 });

  const byId = useMemo(() => new Map(deck.map((c) => [c.id, c])), [deck]);

  useEffect(() => {
    setNow(new Date());
    setSolved(solvedCheckpoints());
  }, []);

  const stats = now ? shelf(deck, understood, solved, review, now) : null;
  const card = session ? byId.get(session[pos] ?? "") : undefined;

  function start() {
    const t = new Date();
    setNow(t);
    setSession(queue(deck, understood, solved, review, t));
    setPos(0);
    setRevealed(false);
    setRetried(new Set());
    setTally({ olvidada: 0, esfuerzo: 0, facil: 0 });
  }

  function answer(rating: Rating) {
    if (!card || !session) return;
    saveRating(card.id, rating);
    setTally((t) => ({ ...t, [rating]: t[rating] + 1 }));
    // A forgotten card comes back once at the end of today's session.
    if (rating === "olvidada" && !retried.has(card.id)) {
      setSession([...session, card.id]);
      setRetried(new Set(retried).add(card.id));
    }
    setPos((p) => p + 1);
    setRevealed(false);
  }

  useEffect(() => {
    if (!card) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if ((e.key === " " || e.key === "Enter") && !revealed && target.tagName !== "BUTTON" && target.tagName !== "A") {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) {
          e.preventDefault();
          answer(r.id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!now || !stats) return <div className="review-shell" aria-busy="true" />;

  const done = session !== null && !card;
  const prevBox = card ? (review[card.id]?.box ?? 0) : 0;

  return (
    <div className="review-shell">
      <dl className="review-stats">
        <div>
          <dt>Para hoy</dt>
          <dd>{stats.due}</dd>
        </div>
        <div>
          <dt>En tu estante</dt>
          <dd>
            {stats.unlocked}
            <span>/{deck.length}</span>
          </dd>
        </div>
        <div>
          <dt>Dominadas</dt>
          <dd>{stats.mastered}</dd>
        </div>
      </dl>

      {card && session ? (
        <section className="review-card plate hud" aria-live="polite" aria-label={`Tarjeta ${pos + 1} de ${session.length}`}>
          <header className="review-card-head">
            <span className="label-mono">
              {card.moduleNum} · {KIND_LABEL[card.kind]}
              {!review[card.id] && " · nueva"}
            </span>
            <span className="label-mono tabular-nums">
              {pos + 1}/{session.length}
            </span>
          </header>
          <div className="meter">
            <span style={{ transform: `scaleX(${pos / session.length})` }} />
          </div>
          <Front card={card} />
          {revealed ? (
            <>
              <Back card={card} />
              <div className="review-rate">
                <p className="text-sm text-muted">Califica lo que recordaste antes de mirar, no lo que reconoces ahora.</p>
                <div className="review-rate-buttons">
                  {RATINGS.map((r) => (
                    <button key={r.id} type="button" className="btn" data-rating={r.id} onClick={() => answer(r.id)}>
                      <kbd>{r.key}</kbd>
                      <span>
                        {r.label}
                        <span className="review-when">vuelve {inDays(intervalFor(nextBox(prevBox, r.id)))}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-lg justify-center" onClick={() => setRevealed(true)}>
              <Eye size={16} aria-hidden /> Mostrar respuesta <kbd>espacio</kbd>
            </button>
          )}
        </section>
      ) : done ? (
        <section className="review-card plate hud">
          <p className="review-ask">
            <Check size={16} aria-hidden /> Sesión terminada
          </p>
          <p className="text-muted">
            {tally.facil} fáciles · {tally.esfuerzo} con esfuerzo · {tally.olvidada} olvidadas. Lo olvidado vuelve mañana;
            lo fácil se aleja cada vez más.
          </p>
          {stats.due > 0 ? (
            <button type="button" className="btn" onClick={start}>
              <RotateCcw size={15} aria-hidden /> Seguir con {stats.due} más
            </button>
          ) : (
            stats.next && (
              <p className="text-ink">
                Próximo repaso {whenLabel(stats.next, now)}: {stats.nextCount} tarjeta{stats.nextCount > 1 ? "s" : ""}.
              </p>
            )
          )}
        </section>
      ) : stats.due > 0 ? (
        <section className="review-card plate hud">
          <p className="review-ask">
            {stats.due} tarjeta{stats.due > 1 ? "s" : ""} para hoy
            {stats.fresh > 0 && ` (${Math.min(stats.fresh, stats.due)} nueva${stats.fresh > 1 ? "s" : ""})`}
          </p>
          <p className="text-muted">
            Unos minutos al día bastan. Cada tarjeta se responde de memoria primero; después comparas y calificas con
            honestidad.
          </p>
          <button type="button" className="btn btn-primary btn-lg justify-center" onClick={start}>
            Empezar repaso <ArrowRight size={16} aria-hidden />
          </button>
        </section>
      ) : (
        <section className="review-card plate hud">
          {stats.unlocked === 0 ? (
            <>
              <p className="review-ask">Tu estante está vacío, por ahora</p>
              <p className="text-muted">
                Cada lección que marcas como entendida añade su tarjeta y la de sus conceptos; cada checkpoint resuelto,
                la suya. Vuelven al día siguiente para comprobar que siguen ahí.
              </p>
            </>
          ) : (
            <>
              <p className="review-ask">
                <Check size={16} aria-hidden /> Nada pendiente hoy
              </p>
              {stats.next && (
                <p className="text-muted">
                  Próximo repaso {whenLabel(stats.next, now)}: {stats.nextCount} tarjeta{stats.nextCount > 1 ? "s" : ""}.
                </p>
              )}
            </>
          )}
        </section>
      )}

      <section aria-labelledby="estante-h">
        <h2 id="estante-h" className="rail-label">
          Estante por módulo
        </h2>
        <table className="data-table mt-sm">
          <thead>
            <tr>
              <th scope="col">Módulo</th>
              <th scope="col">En estante</th>
              <th scope="col">Hoy</th>
              <th scope="col">Dominadas</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => {
              const cards = deck.filter((c) => c.moduleId === m.id);
              const open = cards.filter((c) => dueAt(c, understood, solved, review));
              const due = open.filter((c) => dueAt(c, understood, solved, review)! <= now).length;
              const mastered = open.filter((c) => (review[c.id]?.box ?? 0) >= MASTERED_BOX).length;
              return (
                <tr key={m.id} className="cursor-default">
                  <td>
                    <span className="font-mono text-xs text-neutral">{m.num}</span> <span className="text-ink">{m.title}</span>
                  </td>
                  <td className="font-mono text-xs tabular-nums">
                    {open.length}/{cards.length}
                  </td>
                  <td className="font-mono text-xs tabular-nums">{due || "—"}</td>
                  <td className="font-mono text-xs tabular-nums">{mastered || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-sm text-xs text-neutral">
          Intervalos: 1 · 3 · 7 · 16 · 35 · 90 días. «Fácil» sube la tarjeta un escalón, «Con esfuerzo» repite el
          intervalo y «No la recordé» la devuelve a mañana. Dominada = 16 días o más.
        </p>
      </section>
    </div>
  );
}
