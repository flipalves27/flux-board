import { describe, expect, it } from "vitest";
import { countColumnBlockedOpen, countColumnOverdueOpen } from "./kanban-column-flow";
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

describe("kanban-column-flow", () => {
  it("countColumnBlockedOpen ignores done cards", () => {
    const cards = [
      card({ id: "1", bucket: "a", blockedBy: ["x"], progress: "Concluída" }),
      card({ id: "2", bucket: "a", blockedBy: ["y"] }),
    ];
    expect(countColumnBlockedOpen(cards)).toBe(1);
  });

  it("countColumnOverdueOpen uses local midnight comparison", () => {
    const now = new Date("2026-03-15T15:00:00Z").getTime();
    const cards = [
      card({ id: "1", bucket: "a", dueDate: "2026-03-14", progress: "Em andamento" }),
      card({ id: "2", bucket: "a", dueDate: "2026-03-20", progress: "Em andamento" }),
    ];
    expect(countColumnOverdueOpen(cards, now)).toBe(1);
  });
});
