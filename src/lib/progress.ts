"use client";

import { useSyncExternalStore } from "react";

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
