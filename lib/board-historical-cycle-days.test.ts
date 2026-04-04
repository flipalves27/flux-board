import { describe, expect, it } from "vitest";
import { buildHistoricalCycleDaysFromCards } from "./board-historical-cycle-days";
import type { CardData } from "@/app/board/[id]/page";

function card(p: Partial<CardData> & Pick<CardData, "id" | "bucket">): CardData {
  return {
    priority: "Média",
    progress: "Não iniciado",
    title: "T",
    desc: "",
    tags: [],
    direction: null,
    dueDate: null,
    order: 0,
    ...p,
  } as CardData;
}

describe("buildHistoricalCycleDaysFromCards", () => {
  it("collects completedCycleDays from done cards", () => {
    const cards = [
      card({ id: "1", bucket: "a", progress: "Concluída", completedCycleDays: 5 }),
      card({ id: "2", bucket: "a", progress: "Não iniciado" }),
    ];
    expect(buildHistoricalCycleDaysFromCards(cards)).toEqual([5]);
  });

  it("falls back to createdAt/updatedAt span when present", () => {
    const cards = [
      card({
        id: "1",
        bucket: "a",
        progress: "Concluída",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-11T00:00:00.000Z",
      }) as CardData & { createdAt: string; updatedAt: string },
    ];
    const days = buildHistoricalCycleDaysFromCards(cards);
    expect(days.length).toBe(1);
    expect(days[0]).toBeGreaterThan(9);
    expect(days[0]).toBeLessThan(11);
  });
});
