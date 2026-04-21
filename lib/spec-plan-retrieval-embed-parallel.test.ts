import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpecPlanChunk } from "@/lib/spec-plan-chunk";
import { SPEC_PLAN_EMBED_BATCH, SPEC_PLAN_EMBED_CONCURRENCY } from "@/lib/spec-plan-constants";

const mockFetchTextEmbeddings = vi.hoisted(() => vi.fn());

vi.mock("@/lib/embeddings-together", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/embeddings-together")>();
  return {
    ...orig,
    fetchTextEmbeddingsWithMeta: mockFetchTextEmbeddings,
  };
});

import { buildSpecPlanRetrievalContext } from "@/lib/spec-plan-retrieval";

let embedMaxConcurrent = 0;

function makeChunks(n: number): SpecPlanChunk[] {
  return Array.from({ length: n }, (_, i) => ({
    chunkId: `sp-${i}`,
    chunkIndex: i,
    charStart: i * 100,
    charEnd: (i + 1) * 100,
    text: `chunk body ${i} `.repeat(20),
  }));
}

describe("buildSpecPlanRetrievalContext embedding batches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embedMaxConcurrent = 0;
    let inFlight = 0;
    mockFetchTextEmbeddings.mockImplementation(async (inputs: string[]) => {
      inFlight += 1;
      embedMaxConcurrent = Math.max(embedMaxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight -= 1;
      const dim = 8;
      return {
        ok: true as const,
        vectors: inputs.map((_, row) =>
          Array.from({ length: dim }, (_, col) => (row + 1) * 0.01 + col * 0.001)
        ),
      };
    });
  });

  it("runs multiple chunk embedding batches with limited concurrency (>1 in flight)", async () => {
    const batchSize = SPEC_PLAN_EMBED_BATCH;
    const minBatches = SPEC_PLAN_EMBED_CONCURRENCY + 1;
    const n = batchSize * minBatches;
    const chunks = makeChunks(n);

    const res = await buildSpecPlanRetrievalContext({
      fileName: "big.pdf",
      methodology: "scrum",
      chunks,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.embeddedCount).toBe(n);
    expect(embedMaxConcurrent).toBeGreaterThan(1);
    expect(embedMaxConcurrent).toBeLessThanOrEqual(SPEC_PLAN_EMBED_CONCURRENCY);
  });
});
