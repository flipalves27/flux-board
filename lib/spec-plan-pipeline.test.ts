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
        cardRows: [
          {
            workItemId: "wi1",
            bucketKey: "todo",
            bucketRationale: "r",
            priority: "Média",
            tags: [],
            rationale: "r2",
            blockedByTitles: [],
            subtasks: [],
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

  it("emits cards_llm_started before bucket_mapping and hydrates slim card JSON", async () => {
    const documentText = "x".repeat(12_000);
    const events: { event: string; data: Record<string, unknown> }[] = [];

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
      onEvent: async (ev) => {
        events.push({ event: ev.event, data: ev.data });
      },
    });

    const iCards = events.findIndex((e) => e.event === "cards_llm_started");
    const iBucket = events.findIndex((e) => e.event === "bucket_mapping");
    const iPreview = events.findIndex((e) => e.event === "cards_preview");
    expect(iCards).toBeGreaterThan(-1);
    expect(iBucket).toBeGreaterThan(iCards);
    expect(iPreview).toBeGreaterThan(iBucket);

    const started = events[iCards];
    expect(started?.data.workItemCount).toBe(1);
    expect(started?.data.remapOnly).toBe(false);
    expect(typeof started?.data.promptChars).toBe("number");

    const bm = events.find((e) => e.event === "bucket_mapping");
    expect(bm?.data.rows).toEqual([{ workItemId: "wi1", bucketKey: "todo", why: "r" }]);

    const preview = events.find((e) => e.event === "cards_preview");
    const rows = preview?.data.cardRows as Record<string, unknown>[] | undefined;
    expect(rows?.[0]?.title).toBe("Item");
    expect(rows?.[0]?.desc).toBe("Desc");
    expect(rows?.[0]?.progress).toBe("Não iniciado");

    const thirdCall = mockRunOrgLlm.mock.calls[2]?.[0] as { options?: { maxTokens?: number } } | undefined;
    expect(thirdCall?.options?.maxTokens).toBeDefined();
    expect(thirdCall?.options?.maxTokens).toBeLessThanOrEqual(7500);
  });

  it("remapOnly runs a single cards LLM call and marks cards_llm_started with remapOnly", async () => {
    vi.clearAllMocks();
    mockRunOrgLlm.mockResolvedValue({
      ok: true as const,
      resolvedRoute: "together" as const,
      assistantText: JSON.stringify({
        cardRows: [
          {
            workItemId: "w1",
            bucketKey: "todo",
            bucketRationale: "fit",
            priority: "Média",
            tags: [],
            rationale: "",
            blockedByTitles: [],
            subtasks: [],
          },
        ],
      }),
    });

    const events: { event: string; data: Record<string, unknown> }[] = [];
    await runSpecPlanPipeline({
      org: minimalOrg,
      orgId: minimalOrg._id,
      userId: "u1",
      isAdmin: true,
      methodology: "kanban",
      documentText: "",
      extractMeta: { kind: "text", fileName: "x.txt", warnings: [] },
      allowSubtasks: false,
      board: { config: { bucketOrder: [{ key: "todo", label: "Todo" }] } },
      remapOnly: {
        workItemsJson: JSON.stringify({
          methodologySummary: "M",
          items: [{ id: "w1", title: "A", description: "B", type: "story", suggestedTags: [] }],
        }),
      },
      onEvent: async (ev) => {
        events.push({ event: ev.event, data: ev.data });
      },
    });

    expect(mockRunOrgLlm).toHaveBeenCalledTimes(1);
    const started = events.find((e) => e.event === "cards_llm_started");
    expect(started?.data.remapOnly).toBe(true);
    expect(started?.data.workItemCount).toBe(1);
    const preview = events.find((e) => e.event === "cards_preview");
    const rows = preview?.data.cardRows as Record<string, unknown>[] | undefined;
    expect(rows?.[0]?.title).toBe("A");
    expect(rows?.[0]?.desc).toBe("B");
  });
});
