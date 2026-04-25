import { describe, expect, it } from "vitest";
import { rankTopExecutiveDecisionCards } from "@/lib/executive-decision-rank";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";

const buckets: BucketConfig[] = [
  { key: "a", label: "A", color: "#000" },
  { key: "b", label: "B", color: "#000" },
  { key: "c", label: "C", color: "#000" },
];

function card(p: Partial<CardData> & Pick<CardData, "id" | "title" | "bucket" | "priority" | "progress">): CardData {
  return {
    id: p.id,
    title: p.title,
    bucket: p.bucket,
    priority: p.priority,
    progress: p.progress,
    desc: "",
    tags: [],
    direction: p.direction ?? null,
    dueDate: p.dueDate ?? null,
    blockedBy: p.blockedBy ?? [],
    order: p.order ?? 0,
  };
}

describe("rankTopExecutiveDecisionCards", () => {
  it("ranks urgent and overdue above neutral backlog", () => {
    const cards: CardData[] = [
      card({
        id: "low",
        title: "Low",
        bucket: "a",
        priority: "Média",
        progress: "Não iniciado",
        order: 0,
      }),
      card({
        id: "hot",
        title: "Hot",
        bucket: "c",
        priority: "Urgente",
        progress: "Em andamento",
        order: 1,
        dueDate: "2020-01-01",
        blockedBy: ["x"],
      }),
    ];
    const ranked = rankTopExecutiveDecisionCards(cards, buckets, { limit: 5 });
    expect(ranked.map((c) => c.id)).toEqual(["hot", "low"]);
  });

  it("excludes done cards", () => {
    const cards: CardData[] = [
      card({ id: "d", title: "Done", bucket: "a", priority: "Média", progress: "Concluída" }),
      card({ id: "o", title: "Open", bucket: "a", priority: "Média", progress: "Não iniciado" }),
    ];
    const ranked = rankTopExecutiveDecisionCards(cards, buckets);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.id).toBe("o");
  });
});
