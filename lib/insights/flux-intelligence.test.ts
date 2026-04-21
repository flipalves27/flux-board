import { describe, it, expect } from "vitest";
import { buildFluxIntelligenceInsights } from "@/lib/insights/flux-intelligence";
import type { BoardData } from "@/lib/kv-boards";
import type { SprintData } from "@/lib/schemas";

describe("buildFluxIntelligenceInsights", () => {
  it("returns at least one insight", () => {
    const board = {
      id: "b1",
      orgId: "o1",
      ownerId: "u1",
      name: "Test",
      cards: [],
    } as unknown as BoardData;
    const insights = buildFluxIntelligenceInsights({ board, sprint: null });
    expect(insights.length).toBeGreaterThanOrEqual(1);
    expect(insights[0].boardId).toBe("b1");
  });

  it("flags sprint risk when completion lags time", () => {
    const sprint: SprintData = {
      id: "s1",
      boardId: "b1",
      orgId: "o1",
      name: "S",
      status: "active",
      startDate: "2020-01-01",
      endDate: "2020-01-20",
      goal: "",
      cardIds: ["c1", "c2"],
      doneCardIds: [],
      updatedAt: new Date().toISOString(),
    } as SprintData;

    const board = {
      id: "b1",
      orgId: "o1",
      ownerId: "u1",
      name: "Test",
      cards: [
        { id: "c1", title: "A", storyPoints: 5, progress: "Não iniciado", bucket: "todo" },
        { id: "c2", title: "B", storyPoints: 5, progress: "Não iniciado", bucket: "todo" },
      ],
    } as unknown as BoardData;

    const insights = buildFluxIntelligenceInsights({
      board,
      sprint,
      now: new Date("2020-01-15T12:00:00Z"),
    });
    const risk = insights.find((i) => i.type === "sprint_risk");
    expect(risk).toBeTruthy();
    expect(risk?.severity).toBe("critical");
  });
});
