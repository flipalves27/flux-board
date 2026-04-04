import { describe, expect, it } from "vitest";
import {
  buildRetrievalContextFromHits,
  mergeHitsByChunkId,
  type SpecPlanRetrievalHit,
} from "@/lib/spec-plan-retrieval";

describe("mergeHitsByChunkId", () => {
  it("keeps max score per chunkId", () => {
    const hits: SpecPlanRetrievalHit[] = [
      { chunkId: "a", text: "t1", score: 0.5, chunkIndex: 0 },
      { chunkId: "a", text: "t1", score: 0.9, chunkIndex: 0 },
      { chunkId: "b", text: "t2", score: 0.7, chunkIndex: 1 },
    ];
    const m = mergeHitsByChunkId(hits);
    expect(m).toHaveLength(2);
    const a = m.find((x) => x.chunkId === "a");
    expect(a?.score).toBe(0.9);
    expect(m[0].score).toBeGreaterThanOrEqual(m[1].score);
  });
});

describe("buildRetrievalContextFromHits", () => {
  it("respects character budget", () => {
    const long = "z".repeat(5000);
    const hits: SpecPlanRetrievalHit[] = [
      { chunkId: "1", text: long, score: 1, chunkIndex: 0 },
      { chunkId: "2", text: "short", score: 0.5, chunkIndex: 1 },
    ];
    const { text, chunksUsed } = buildRetrievalContextFromHits(hits, 800);
    expect(text.length).toBeLessThanOrEqual(800);
    expect(chunksUsed).toBeGreaterThanOrEqual(1);
  });

  it("includes ordered trecho headers", () => {
    const hits: SpecPlanRetrievalHit[] = [
      { chunkId: "1", text: "alpha", score: 1, chunkIndex: 3 },
      { chunkId: "2", text: "beta", score: 0.5, chunkIndex: 7 },
    ];
    const { text } = buildRetrievalContextFromHits(hits, 4000);
    expect(text).toContain("### Trecho 1");
    expect(text).toContain("alpha");
    expect(text).toContain("### Trecho 2");
    expect(text).toContain("beta");
  });
});
