"use client";

import { useSyncExternalStore } from "react";
import { routeName } from "./names";

// Asterisms: routes the learner draws between concept stars, announced like a
// private autonomous system. Per browser only.

export type Asterism = {
  id: string;
  name: string;
  /** Private AS number shown next to the codename, e.g. "AS64731". */
  asn: string;
  /** Star ids in drawing order; lines are drawn between them. */
  stars: string[];
  edges: [string, string][];
  closed: boolean;
  createdAt: string;
};

const KEY = "lnet:asterisms:v1";
const NONE: Asterism[] = [];
const listeners = new Set<() => void>();
let snap: Asterism[] | null = null;

function read(): Asterism[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return NONE;
    // Routes saved by the earlier "mythic names" version get a codename + AS.
    const list = parsed as (Asterism & { latin?: string })[];
    if (list.every((a) => a.asn)) return list;
    const migrated = list.map(({ latin: _old, ...a }) => (a.asn ? a : { ...a, ...routeName() }));
    window.localStorage.setItem(KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return NONE;
  }
}

function write(next: Asterism[]) {
  snap = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: asterisms stay in memory for this tab */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
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

export function useAsterisms(): Asterism[] {
  return useSyncExternalStore(subscribe, () => (snap ??= read()), () => NONE);
}

export function addAsterism(stars: string[], edges: [string, string][], closed: boolean): Asterism {
  const { name, asn } = routeName();
  const a: Asterism = {
    id: `ast-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    name,
    asn,
    stars,
    edges,
    closed,
    createdAt: new Date().toISOString(),
  };
  write([...(snap ??= read()), a]);
  return a;
}

export function renameAsterism(id: string) {
  const { name, asn } = routeName();
  write((snap ??= read()).map((a) => (a.id === id ? { ...a, name, asn } : a)));
}

export function removeAsterism(id: string) {
  write((snap ??= read()).filter((a) => a.id !== id));
}

export function clearAsterisms() {
  write([]);
}
