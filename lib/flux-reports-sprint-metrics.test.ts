import { describe, expect, it, vi } from "vitest";
import type { BoardData } from "./kv-boards";

vi.mock("./kv-sprints", () => ({
  listSprints: vi.fn(async () => [
    {
      id: "s1",
      orgId: "o1",
      boardId: "b1",
      name: "Sprint 1",
      goal: "Ship",
      status: "closed" as const,
      startDate: null,
      endDate: "2025-01-15",
      velocity: null,
      cardIds: [],
      doneCardIds: ["c1"],
      ceremonyIds: [],
      burndownSnapshots: [],
      addedMidSprint: [],
      removedCardIds: [],
      cadenceType: "timebox" as const,
      reviewCadenceDays: null,
      wipPolicyNote: "",
      plannedCapacity: null,
      commitmentNote: "",
      definitionOfDoneItemIds: [],
      sprintGoalHistory: [],
      programIncrementId: null,
      sprintTags: [],
      customFields: {},
      createdAt: "x",
      updatedAt: "x",
    },
  ]),
}));

describe("flux-reports-sprint-metrics", () => {
  it("sums story points from done cards on closed sprints", async () => {
    const { buildSprintStoryPointsHistory } = await import("./flux-reports-sprint-metrics");
    const boards: BoardData[] = [
      {
        id: "b1",
        name: "Board",
        orgId: "o1",
        ownerId: "u1",
        boardMethodology: "scrum",
        cards: [
          {
            id: "c1",
            bucket: "done",
            progress: "Concluída",
            title: "Card",
            desc: "",
            priority: "Média",
            tags: [],
            order: 0,
            storyPoints: 5,
          },
        ],
        config: { bucketOrder: [{ key: "done", label: "Done", color: "var(--flux-primary)" }] },
      } as unknown as BoardData,
    ];
    const rows = await buildSprintStoryPointsHistory("o1", boards);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.completedStoryPoints).toBe(5);
  });
});
