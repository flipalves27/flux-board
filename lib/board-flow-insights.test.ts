import { describe, expect, it } from "vitest";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import { listWipBreaches, listBlockedCardIds, buildFlowInsightChips } from "@/lib/board-flow-insights";

const card = (over: Partial<CardData>): CardData => ({
  id: "1",
  bucket: "A",
  priority: "Média",
  progress: "Não iniciado",
  title: "T",
  desc: "",
  tags: [],
  direction: null,
  dueDate: null,
  order: 0,
  ...over,
});

describe("board-flow-insights", () => {
  it("lists wip breaches when count exceeds limit", () => {
    const buckets: BucketConfig[] = [{ key: "A", label: "A", color: "x", wipLimit: 1 }];
    const cards = [card({ id: "a", bucket: "A" }), card({ id: "b", bucket: "A" })];
    const b = listWipBreaches(buckets, cards);
    expect(b).toHaveLength(1);
    expect(b[0].count).toBe(2);
    expect(b[0].limit).toBe(1);
  });

  it("lists blocked open cards", () => {
    const cards = [
      card({ id: "x", blockedBy: ["y"], progress: "Não iniciado" }),
      card({ id: "y", progress: "Concluída", blockedBy: ["z"] }),
    ];
    expect(listBlockedCardIds(cards)).toEqual(["x"]);
  });

  it("buildFlowInsightChips includes wip chip when breached", () => {
    const buckets: BucketConfig[] = [{ key: "A", label: "A", color: "x", wipLimit: 1 }];
    const cards = [card({ id: "a", bucket: "A" }), card({ id: "b", bucket: "A" })];
    const chips = buildFlowInsightChips({ cards, buckets, lastUpdated: new Date().toISOString() });
    expect(chips.some((c) => c.kind === "wip")).toBe(true);
  });
});
