import { describe, expect, it } from "vitest";
import { allCheckpoints, checkpointFor } from "./checkpoints";

describe("decision checkpoints", () => {
  it("keeps a single answer key and a traceable source for every checkpoint", () => {
    for (const checkpoint of allCheckpoints()) {
      expect(checkpoint.options.filter((option) => option.correct)).toHaveLength(1);
      expect(checkpoint.source).toMatch(/\[[A-Za-z&]+,\s*caps?\./);
    }
  });

  it("provides one checkpoint for every module in the roadmap", () => {
    expect(checkpointFor("modulo-01")?.id).toBe("m01-syn-without-return");
    expect(allCheckpoints().map((checkpoint) => checkpoint.id)).toEqual([
      "m01-syn-without-return",
      "m02-bridge-is-not-forward",
      "m03-dns-is-not-identity",
      "m04-default-deny-needs-dns",
      "m05-xdp-precedes-tc",
      "m06-nacl-needs-return",
    ]);
  });
});
