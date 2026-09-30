import { useSyncExternalStore } from "react";
import type { UnderstoodState } from "./progress";

// Spaced review. Cards come from what the learner already marked as learned
// (understood lessons, the concepts inside them, solved checkpoints); nothing
// enters the shelf before that. Scheduling is a plain Leitner system: each box
// has a fixed interval, remembering moves a card up, forgetting sends it to box 1.
// Everything here is pure except the store at the end.

/** What unlocks a card: any of these lessons understood, or that checkpoint solved. */
export type Unlock =
  | { kind: "lessons"; refs: { moduleId: string; lessonId: string }[] }
  | { kind: "checkpoint"; id: string };

type CardBase = { id: string; moduleId: string; moduleNum: string; href: string; unlock: Unlock };

export type ReviewCard =
  | (CardBase & { kind: "leccion"; title: string; answer: string })
  | (CardBase & { kind: "concepto"; term: string; short: string; analogy: string; why: string })
  | (CardBase & {
      kind: "checkpoint";
      title: string;
      prompt: string;
      observation: string[];
      question: string;
      options: { label: string; correct: boolean }[];
      takeaway: string;
    });

/** What scheduling needs from a card; small enough to ship on every page. */
export type CardKey = Pick<ReviewCard, "id" | "unlock">;

export type Rating = "olvidada" | "esfuerzo" | "facil";

export type CardState = { box: number; due: string; last: string; reviews: number; lapses: number };

export type ReviewState = Record<string, CardState>;

/** Days until the next review for boxes 1…6. */
export const INTERVALS = [1, 3, 7, 16, 35, 90] as const;

/** Box at which a card counts as mastered (≥ 16 days between reviews). */
export const MASTERED_BOX = 4;

/** Local midnight `days` after `from`; reviews fall due at the start of a day. */
export function dayStart(from: Date, days = 0): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

export function nextBox(prev: number, rating: Rating): number {
  if (rating === "olvidada") return 1;
  if (rating === "esfuerzo") return Math.max(1, prev);
  // Easy on a new card skips box 1: it was already understood when unlocked.
  return Math.min(INTERVALS.length, Math.max(2, prev + 1));
}

export const intervalFor = (box: number) => INTERVALS[Math.min(Math.max(box, 1), INTERVALS.length) - 1]!;

export function rate(prev: CardState | undefined, rating: Rating, now: Date): CardState {
  const box = nextBox(prev?.box ?? 0, rating);
  return {
    box,
    due: dayStart(now, intervalFor(box)).toISOString(),
    last: now.toISOString(),
    reviews: (prev?.reviews ?? 0) + 1,
    lapses: (prev?.lapses ?? 0) + (rating === "olvidada" && prev ? 1 : 0),
  };
}

/**
 * When a card was unlocked: the earliest understood lesson that unlocks it, or
 * epoch for a solved checkpoint (no date is kept for those). null = still locked.
 */
export function unlockedAt(key: CardKey, understood: UnderstoodState, solved: string[]): Date | null {
  if (key.unlock.kind === "checkpoint") return solved.includes(key.unlock.id) ? new Date(0) : null;
  const dates = key.unlock.refs
    .map((r) => understood[r.moduleId]?.[r.lessonId])
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime());
  return dates.length ? new Date(Math.min(...dates)) : null;
}

/** A new card waits one day after it is unlocked, so the first review is already spaced. */
export function dueAt(key: CardKey, understood: UnderstoodState, solved: string[], state: ReviewState): Date | null {
  const since = unlockedAt(key, understood, solved);
  if (!since) return null;
  const st = state[key.id];
  return st ? new Date(st.due) : since.getTime() === 0 ? since : dayStart(since, 1);
}

export type Shelf = {
  unlocked: number;
  due: number;
  fresh: number;
  mastered: number;
  /** Earliest due date after today, for "next review" messages. */
  next: Date | null;
  nextCount: number;
};

export function shelf(keys: CardKey[], understood: UnderstoodState, solved: string[], state: ReviewState, now: Date): Shelf {
  const out: Shelf = { unlocked: 0, due: 0, fresh: 0, mastered: 0, next: null, nextCount: 0 };
  for (const k of keys) {
    const due = dueAt(k, understood, solved, state);
    if (!due) continue;
    out.unlocked++;
    if (!state[k.id]) out.fresh++;
    if ((state[k.id]?.box ?? 0) >= MASTERED_BOX) out.mastered++;
    if (due <= now) out.due++;
    else if (!out.next || due < out.next) {
      out.next = due;
      out.nextCount = 1;
    } else if (due.getTime() === out.next.getTime()) out.nextCount++;
  }
  return out;
}

/** Today's session: overdue reviews first (oldest first), then new cards in deck (course) order, capped. */
export function queue(keys: CardKey[], understood: UnderstoodState, solved: string[], state: ReviewState, now: Date, limit = 20): string[] {
  return keys
    .map((k, order) => ({ id: k.id, order, due: dueAt(k, understood, solved, state), fresh: !state[k.id] }))
    .filter((x): x is { id: string; order: number; due: Date; fresh: boolean } => x.due !== null && x.due <= now)
    .sort((a, b) =>
      a.fresh !== b.fresh ? Number(a.fresh) - Number(b.fresh) : a.fresh ? a.order - b.order : a.due.getTime() - b.due.getTime(),
    )
    .slice(0, limit)
    .map((x) => x.id);
}

// ─── Store (per browser, like the rest of the progress) ─────────────────────

const REVIEW_KEY = "lnet:review:v1";
const NO_REVIEW: ReviewState = {};
const listeners = new Set<() => void>();
let snap: ReviewState | null = null;

function read(): ReviewState {
  try {
    const raw = window.localStorage.getItem(REVIEW_KEY);
    return raw ? (JSON.parse(raw) as ReviewState) : NO_REVIEW;
  } catch {
    return NO_REVIEW;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === REVIEW_KEY) {
      snap = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useReview(): ReviewState {
  return useSyncExternalStore(
    subscribe,
    () => (snap ??= read()),
    () => NO_REVIEW,
  );
}

export function saveRating(cardId: string, rating: Rating, now = new Date()) {
  const cur = (snap ??= read());
  snap = { ...cur, [cardId]: rate(cur[cardId], rating, now) };
  try {
    window.localStorage.setItem(REVIEW_KEY, JSON.stringify(snap));
  } catch {
    /* in-memory only */
  }
  listeners.forEach((l) => l());
}
