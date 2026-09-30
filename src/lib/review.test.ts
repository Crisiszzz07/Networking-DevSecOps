import { describe, expect, it } from "vitest";
import { loadModules } from "./content";
import { buildDeck, deckKeys } from "./deck";
import { dayStart, dueAt, queue, rate, shelf, type CardKey, type ReviewState } from "./review";
import type { UnderstoodState } from "./progress";

const now = new Date(2026, 8, 29, 18, 0);
const yesterday = new Date(2026, 8, 28, 10, 0).toISOString();
const lessonKey = (id: string): CardKey => ({ id, unlock: { kind: "lessons", refs: [{ moduleId: "m1", lessonId: id }] } });

describe("leitner scheduling", () => {
  it("moves up on easy, repeats on effort, restarts on forget", () => {
    const easy = rate(undefined, "facil", now);
    expect(easy.box).toBe(2);
    expect(new Date(easy.due)).toEqual(dayStart(now, 3));
    const again = rate(easy, "esfuerzo", now);
    expect(again.box).toBe(2);
    const up = rate(again, "facil", now);
    expect(up.box).toBe(3);
    expect(new Date(up.due)).toEqual(dayStart(now, 7));
    const lost = rate(up, "olvidada", now);
    expect(lost).toMatchObject({ box: 1, lapses: 1, reviews: 4 });
    expect(new Date(lost.due)).toEqual(dayStart(now, 1));
  });

  it("keeps a card locked until its lesson is understood, then waits a day", () => {
    const k = lessonKey("a");
    expect(dueAt(k, {}, [], {})).toBeNull();
    expect(dueAt(k, { m1: { a: yesterday } }, [], {})).toEqual(dayStart(new Date(yesterday), 1));
  });

  it("hides a card again if its lesson is unmarked, even with history", () => {
    const state: ReviewState = { a: rate(undefined, "facil", now) };
    expect(dueAt(lessonKey("a"), {}, [], state)).toBeNull();
  });

  it("queues overdue reviews before new cards and caps the session", () => {
    const keys = ["a", "b", "c"].map(lessonKey);
    const understood: UnderstoodState = { m1: { a: yesterday, b: yesterday, c: yesterday } };
    const state: ReviewState = { c: { box: 1, due: dayStart(now, -3).toISOString(), last: yesterday, reviews: 1, lapses: 0 } };
    expect(queue(keys, understood, [], state, now)).toEqual(["c", "a", "b"]);
    expect(queue(keys, understood, [], state, now, 2)).toEqual(["c", "a"]);
    expect(shelf(keys, understood, [], state, now)).toMatchObject({ unlocked: 3, due: 3, fresh: 2 });
  });

  it("makes a solved checkpoint due at once", () => {
    const k: CardKey = { id: "cp", unlock: { kind: "checkpoint", id: "m01-x" } };
    expect(queue([k], {}, [], {}, now)).toEqual([]);
    expect(queue([k], {}, ["m01-x"], {}, now)).toEqual(["cp"]);
  });
});

describe("deck", () => {
  const deck = buildDeck(loadModules());

  it("has one card per lesson and checkpoint, plus the concepts lessons discuss", () => {
    const count = (kind: string) => deck.filter((c) => c.kind === kind).length;
    expect(count("leccion")).toBe(28);
    expect(count("checkpoint")).toBe(6);
    expect(count("concepto")).toBeGreaterThan(20);
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
  });

  it("files new cards in course order: lesson, its new concepts, checkpoint last", () => {
    const m1 = deck.filter((c) => c.moduleId === "modulo-01").map((c) => c.kind);
    expect(m1[0]).toBe("leccion");
    expect(m1.at(-1)).toBe("checkpoint");
    expect(m1.indexOf("concepto")).toBeGreaterThan(0);
  });

  it("gives every lesson card a thesis without citation brackets", () => {
    for (const c of deck) if (c.kind === "leccion") expect(c.answer).toMatch(/^[^[\]]{40,}$/);
  });

  it("ships only ids and unlock rules to the header", () => {
    expect(Object.keys(deckKeys(deck)[0]!)).toEqual(["id", "unlock"]);
  });
});
