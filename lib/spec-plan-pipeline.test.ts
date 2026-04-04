import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Organization } from "@/lib/kv-organizations";
import { SPEC_PLAN_LLM_DOC_CHUNK_CHARS } from "@/lib/spec-plan-constants";

vi.mock("server-only", () => ({}));

const { mockBuildRetrieval, mockRunOrgLlm } = vi.hoisted(() => ({
  mockBuildRetrieval: vi.fn(),
  mockRunOrgLlm: vi.fn(),
}));

vi.mock("@/lib/spec-plan-retrieval", () => ({
  buildSpecPlanRetrievalContext: mockBuildRetrieval,
}));

vi.mock("@/lib/llm-org-chat", () => ({
  runOrgLlmChat: mockRunOrgLlm,
}));

import { runSpecPlanPipeline } from "@/lib/spec-plan-pipeline";

const minimalOrg: Organization = {
  _id: "org_test",
  name: "Test",
  slug: "test",
  ownerId: "user_1",
  plan: "business",
  maxUsers: 10,
  maxBoards: 10,
  createdAt: new Date().toISOString(),
};

const retrievalOk = {
  ok: true as const,
  context: "retrieval-context",
  embeddedCount: 3,
  queries: ["q1"],
  preview: [] as { chunkIndex: number; score: number }[],
  modelHint: "m",
  chunksUsed: 2,
};

function stubLlmResponses() {
  let n = 0;
  mockRunOrgLlm.mockImplementation(async () => {
    n += 1;
    if (n === 1) {
      return {
        ok: true as const,
        resolvedRoute: "together" as const,
        assistantText: JSON.stringify({
          sections: [{ title: "Sec", summary: "Sum", subsections: [] }],
          keyRequirements: [{ id: "k1", text: "Requirement" }],
        }),
      };
    }
    if (n === 2) {
      return {
        ok: true as const,
        resolvedRoute: "together" as const,
        assistantText: JSON.stringify({
          methodologySummary: "M",
          items: [
            {
              id: "wi1",
              title: "Item",
              description: "Desc",
              type: "story",
              suggestedTags: [],
            },
          ],
        }),
      };
    }
    return {
      ok: true as const,
      resolvedRoute: "together" as const,
      assistantText: JSON.stringify({
        bucketMappingPreview: [],
        cardRows: [
          {
            workItemId: "wi1",
            title: "Card",
            desc: "D",
            bucketKey: "todo",
            bucketRationale: "r",
            priority: "Média",
            progress: "0%",
            rationale: "r",
          },
        ],
      }),
    };
  });
}

describe("runSpecPlanPipeline RAG shortcut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildRetrieval.mockResolvedValue(retrievalOk);
    stubLlmResponses();
  });

  it("does not call retrieval when document fits within SPEC_PLAN_LLM_DOC_CHUNK_CHARS", async () => {
    const documentText = "x".repeat(12_000);
    expect(documentText.length).toBeLessThanOrEqual(SPEC_PLAN_LLM_DOC_CHUNK_CHARS);

    await runSpecPlanPipeline({
      org: minimalOrg,
      orgId: minimalOrg._id,
      userId: "u1",
      isAdmin: true,
      methodology: "scrum",
      documentText,
      extractMeta: { kind: "text", fileName: "spec.txt", warnings: [] },
      allowSubtasks: false,
      board: { config: { bucketOrder: [] } },
      onEvent: async () => {},
    });

    expect(mockBuildRetrieval).not.toHaveBeenCalled();
  });

  it("calls retrieval when document exceeds SPEC_PLAN_LLM_DOC_CHUNK_CHARS", async () => {
    const documentText = "y".repeat(SPEC_PLAN_LLM_DOC_CHUNK_CHARS + 500);

    await runSpecPlanPipeline({
      org: minimalOrg,
      orgId: minimalOrg._id,
      userId: "u1",
      isAdmin: true,
      methodology: "scrum",
      documentText,
      extractMeta: { kind: "text", fileName: "long.txt", warnings: [] },
      allowSubtasks: false,
      board: { config: { bucketOrder: [] } },
      onEvent: async () => {},
    });

    expect(mockBuildRetrieval).toHaveBeenCalledTimes(1);
  });

  it("emits embeddings_ready with skippedFullDocFitsLlm for full-doc shortcut", async () => {
    const documentText = "z".repeat(8000);
    const events: { event: string; data: Record<string, unknown> }[] = [];

    await runSpecPlanPipeline({
      org: minimalOrg,
      orgId: minimalOrg._id,
      userId: "u1",
      isAdmin: true,
      methodology: "scrum",
      documentText,
      extractMeta: { kind: "text", fileName: "short.txt", warnings: [] },
      allowSubtasks: false,
      board: { config: { bucketOrder: [] } },
      onEvent: async (ev) => {
        events.push({ event: ev.event, data: ev.data });
      },
    });

    const emb = events.find((e) => e.event === "embeddings_ready");
    expect(emb?.data.skippedFullDocFitsLlm).toBe(true);
    expect(emb?.data.embeddedCount).toBe(0);

    const retr = events.find((e) => e.event === "retrieval_ready");
    expect(retr?.data.skippedFullDocFitsLlm).toBe(true);
    expect(retr?.data.fallback).toBe(true);
  });
});
