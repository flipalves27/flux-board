import { describe, expect, it } from "vitest";
import { BoardTemplateSnapshotSchema } from "./schemas";
import { defaultBucketOrderSafe } from "./board-methodology";
import type { BoardData } from "./kv-boards";
import { buildSwotSnapshotFromBoard } from "./template-snapshot";
import { createBoardFromTemplateSnapshot } from "./template-import";

describe("template snapshot + schema with safe", () => {
  it("BoardTemplateSnapshotSchema accepts boardMethodology safe", () => {
    const snap = {
      config: {
        bucketOrder: defaultBucketOrderSafe().map((b) => ({ key: b.key, label: b.label, color: b.color })),
        collapsedColumns: [] as string[],
        labels: ["Feature"],
      },
      mapaProducao: [],
      labelPalette: [] as string[],
      automations: [] as unknown[],
      boardMethodology: "safe" as const,
    };
    const p = BoardTemplateSnapshotSchema.safeParse(snap);
    expect(p.success).toBe(true);
  });
});

describe("swot template snapshot + import", () => {
  const board: BoardData = {
    id: "board_swot_source",
    ownerId: "user_1",
    orgId: "org_swot",
    name: "Strategy board",
    boardMethodology: "kanban",
    version: "2.0",
    cards: [
      {
        id: "card_strength",
        bucket: "backlog",
        priority: "Média",
        progress: "Não iniciado",
        title: "Strong enterprise channel",
        desc: "Win rate is high.",
        tags: ["Sales"],
        order: 0,
        blockedBy: [],
      },
      {
        id: "card_threat",
        bucket: "backlog",
        priority: "Alta",
        progress: "Não iniciado",
        title: "Competitor discounting",
        desc: "",
        tags: ["Risk"],
        order: 1,
        blockedBy: [],
      },
    ],
    config: {
      bucketOrder: [{ key: "backlog", label: "Backlog", color: "var(--flux-primary)" }],
      collapsedColumns: [],
      labels: ["Sales", "Risk"],
    },
    mapaProducao: [],
    dailyInsights: [],
  };

  it("builds a valid SWOT/TOWS snapshot with strategic buckets and card metadata", () => {
    const snap = buildSwotSnapshotFromBoard(board, [
      { cardId: "card_strength", quadrantKey: "strengths", evidence: "CRM win-rate 42%", impact: 5, confidence: 4 },
      { cardId: "card_threat", quadrantKey: "threats", evidence: "Field feedback", risk: 5 },
    ]);

    expect(snap.templateKind).toBe("swot");
    expect(snap.config.strategyTemplateKind).toBe("swot");
    expect(snap.config.bucketOrder).toHaveLength(6);
    expect(snap.labelPalette).toContain("TOWS");
    expect(snap.templateCards).toHaveLength(2);
    expect(BoardTemplateSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it("imports SWOT snapshots as kanban boards with SWOT identification", async () => {
    const snap = buildSwotSnapshotFromBoard(board, [
      { cardId: "card_strength", quadrantKey: "strengths", evidence: "CRM win-rate 42%" },
    ]);

    const imported = await createBoardFromTemplateSnapshot("org_swot_import", "user_1", "Imported SWOT", snap);

    expect(imported.boardMethodology).toBe("kanban");
    expect(imported.config?.strategyTemplateKind).toBe("swot");
    expect(imported.config?.labels).toContain("SWOT");
    expect((imported.config?.cardRules as { requireAssignee?: boolean } | undefined)?.requireAssignee).toBe(true);
    expect(imported.cards).toHaveLength(1);
    expect((imported.cards?.[0] as { id?: string; bucket?: string; swotMeta?: unknown }).bucket).toBe("strengths");
    expect((imported.cards?.[0] as { id?: string }).id).not.toBe("card_strength");
  });
});
