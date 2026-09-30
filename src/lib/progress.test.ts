import { describe, expect, it } from "vitest";
import { nextStep, trackFraction, understoodCount, type ProgressState, type Track, type UnderstoodState } from "./progress";

const lesson = (id: string) => ({ id, title: id, minutes: 3 });
const tracks: Track[] = [
  { moduleId: "modulo-01", labId: "lab-01", checkCount: 2, lessons: [lesson("a"), lesson("b")] },
  { moduleId: "modulo-02", labId: "lab-02", checkCount: 1, lessons: [lesson("c")] },
];
const at = "2026-09-29T00:00:00.000Z";
const labDone = (n: number): ProgressState["x"] => ({
  checks: Object.fromEntries(Array.from({ length: n }, (_, i) => [i, "pass" as const])),
  manual: {},
  source: null,
  updatedAt: null,
});

describe("comprehension progress", () => {
  it("ignores marks for lessons that no longer exist", () => {
    const understood: UnderstoodState = { "modulo-01": { a: at, renamed: at } };
    expect(understoodCount(understood, "modulo-01", tracks[0]!.lessons)).toBe(1);
  });

  it("weighs lessons and lab checks equally", () => {
    const understood: UnderstoodState = { "modulo-01": { a: at, b: at } };
    expect(trackFraction(tracks[0]!, understood, {})).toBe(0.5);
    expect(trackFraction(tracks[0]!, understood, { "lab-01": labDone(1) })).toBe(0.75);
  });

  it("resumes at the first lesson not understood, then at the lab", () => {
    expect(nextStep(tracks, {}, {})).toMatchObject({ track: { moduleId: "modulo-01" }, lesson: { id: "a" } });
    const read: UnderstoodState = { "modulo-01": { a: at, b: at } };
    expect(nextStep(tracks, read, {})).toMatchObject({ track: { moduleId: "modulo-01" }, lesson: null });
    expect(nextStep(tracks, read, { "lab-01": labDone(2) })).toMatchObject({ track: { moduleId: "modulo-02" }, lesson: { id: "c" } });
    const all: UnderstoodState = { ...read, "modulo-02": { c: at } };
    expect(nextStep(tracks, all, { "lab-01": labDone(2), "lab-02": labDone(1) })).toBeNull();
  });
});
