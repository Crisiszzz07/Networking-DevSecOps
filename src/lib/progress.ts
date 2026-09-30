"use client";

import { useSyncExternalStore } from "react";
import type { LessonRef } from "./types";

// Per-viewer lab progress. It lives in this browser only (localStorage), which is
// the right scope for a local learning tool; every access is guarded because
// storage can be missing (private mode, blocked site data).

export type CheckMark = "pass" | "fail";

export type LabProgress = {
  checks: Record<number, CheckMark>;
  manual: Record<number, boolean>;
  source: string | null;
  updatedAt: string | null;
};

export type ProgressState = Record<string, LabProgress>;

const KEY = "lnet:progress:v1";
const EMPTY: ProgressState = {};
const listeners = new Set<() => void>();
let snapshot: ProgressState | null = null;

function read(): ProgressState {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProgressState) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snapshot = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): ProgressState {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

export function useProgress(): ProgressState {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export const emptyLab = (): LabProgress => ({ checks: {}, manual: {}, source: null, updatedAt: null });

export function updateLab(labId: string, fn: (prev: LabProgress) => LabProgress | null) {
  const current = getSnapshot();
  const nextLab = fn(current[labId] ?? emptyLab());
  const next = { ...current };
  if (nextLab === null) delete next[labId];
  else next[labId] = { ...nextLab, updatedAt: new Date().toISOString() };
  snapshot = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: progress stays in memory for this tab */
  }
  listeners.forEach((l) => l());
}

export function restoreLab(labId: string, lab: LabProgress | undefined) {
  updateLab(labId, () => lab ?? null);
}

/** Checks confirmed either by pasted output or by the learner's manual mark. */
export function doneCount(lab: LabProgress | undefined, total: number): number {
  if (!lab) return 0;
  let n = 0;
  for (let i = 0; i < total; i++) if (lab.checks[i] === "pass" || lab.manual[i]) n++;
  return n;
}

// ─── Explored concepts (glossary stars you have opened) ─────────────────────

const SEEN_KEY = "lnet:seen:v1";
const NO_SEEN: string[] = [];
const seenListeners = new Set<() => void>();
let seenSnap: string[] | null = null;

function readSeen(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : NO_SEEN;
  } catch {
    return NO_SEEN;
  }
}

function subscribeSeen(cb: () => void) {
  seenListeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SEEN_KEY) {
      seenSnap = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    seenListeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSeen(): string[] {
  return useSyncExternalStore(
    subscribeSeen,
    () => (seenSnap ??= readSeen()),
    () => NO_SEEN,
  );
}

export function markSeen(id: string) {
  const cur = (seenSnap ??= readSeen());
  if (cur.includes(id)) return;
  seenSnap = [...cur, id];
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seenSnap));
  } catch {
    /* in-memory only */
  }
  seenListeners.forEach((l) => l());
}

// ─── Understood lessons (comprehension, self-reported) ──────────────────────
// moduleId → lessonId → when it was marked. The date is kept so a later review
// pass can decide what is due; only ids that still exist in the content count.

export type UnderstoodState = Record<string, Record<string, string>>;

const UNDERSTOOD_KEY = "lnet:understood:v1";
const NO_UNDERSTOOD: UnderstoodState = {};
const understoodListeners = new Set<() => void>();
let understoodSnap: UnderstoodState | null = null;

function readUnderstood(): UnderstoodState {
  try {
    const raw = window.localStorage.getItem(UNDERSTOOD_KEY);
    return raw ? (JSON.parse(raw) as UnderstoodState) : NO_UNDERSTOOD;
  } catch {
    return NO_UNDERSTOOD;
  }
}

function subscribeUnderstood(cb: () => void) {
  understoodListeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === UNDERSTOOD_KEY) {
      understoodSnap = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    understoodListeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useUnderstood(): UnderstoodState {
  return useSyncExternalStore(
    subscribeUnderstood,
    () => (understoodSnap ??= readUnderstood()),
    () => NO_UNDERSTOOD,
  );
}

export function setUnderstood(moduleId: string, lessonId: string, on: boolean) {
  const cur = (understoodSnap ??= readUnderstood());
  const mod = { ...cur[moduleId] };
  if (on) mod[lessonId] = new Date().toISOString();
  else delete mod[lessonId];
  understoodSnap = { ...cur, [moduleId]: mod };
  try {
    window.localStorage.setItem(UNDERSTOOD_KEY, JSON.stringify(understoodSnap));
  } catch {
    /* in-memory only */
  }
  understoodListeners.forEach((l) => l());
}

export const isUnderstood = (state: UnderstoodState, moduleId: string, lessonId: string) =>
  Boolean(state[moduleId]?.[lessonId]);

export function understoodCount(state: UnderstoodState, moduleId: string, lessons: LessonRef[]): number {
  return lessons.filter((l) => isUnderstood(state, moduleId, l.id)).length;
}

export function firstPending(state: UnderstoodState, moduleId: string, lessons: LessonRef[]): LessonRef | null {
  return lessons.find((l) => !isUnderstood(state, moduleId, l.id)) ?? null;
}

/** What a module asks of the learner: its lessons, understood, and its lab, verified. */
export type Track = { moduleId: string; labId: string; checkCount: number; lessons: LessonRef[] };

/** Comprehension and practice weigh the same, whatever their sizes. */
export function trackFraction(t: Track, understood: UnderstoodState, progress: ProgressState): number {
  const parts: number[] = [];
  if (t.lessons.length) parts.push(understoodCount(understood, t.moduleId, t.lessons) / t.lessons.length);
  if (t.checkCount) parts.push(doneCount(progress[t.labId], t.checkCount) / t.checkCount);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
}

/**
 * Where to resume: the first module with pending work, pointing at its first
 * lesson not yet understood, or at the lab once every lesson is.
 */
export function nextStep<T extends Track>(
  tracks: T[],
  understood: UnderstoodState,
  progress: ProgressState,
): { track: T; lesson: LessonRef | null } | null {
  for (const t of tracks) {
    const lesson = firstPending(understood, t.moduleId, t.lessons);
    if (lesson || doneCount(progress[t.labId], t.checkCount) < t.checkCount) return { track: t, lesson };
  }
  return null;
}
