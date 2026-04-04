import { describe, it, expect } from "vitest";
import type { SprintData } from "./schemas";
import { countActiveSprints, mergeSprintsWithBoardMeta } from "./sprints-org-overview";

function sprint(p: Partial<SprintData> & Pick<SprintData, "id" | "boardId" | "updatedAt">): SprintData {
  return {
    orgId: "o1",
    name: "S",
    goal: "",
    status: "planning",
    startDate: null,
    endDate: null,
    velocity: null,
    cardIds: [],
    doneCardIds: [],
    ceremonyIds: [],
    burndownSnapshots: [],
    addedMidSprint: [],
    removedCardIds: [],
    cadenceType: "timebox",
    reviewCadenceDays: null,
    wipPolicyNote: "",
    plannedCapacity: null,
    commitmentNote: "",
    definitionOfDoneItemIds: [],
    sprintGoalHistory: [],
    programIncrementId: null,
    sprintTags: [],
    customFields: {},
    createdAt: "t",
    ...p,
  };
}

describe("mergeSprintsWithBoardMeta", () => {
  it("merges and sorts by updatedAt desc", () => {
    const boards = [
      { id: "b1", name: "Alpha" },
      { id: "b2", name: "Beta" },
    ];
    const map = new Map<string, SprintData[]>([
      ["b1", [sprint({ id: "s1", boardId: "b1", updatedAt: "2026-01-01T00:00:00.000Z" })]],
      ["b2", [sprint({ id: "s2", boardId: "b2", updatedAt: "2026-02-01T00:00:00.000Z" })]],
    ]);
    const flat = mergeSprintsWithBoardMeta(boards, map);
    expect(flat.map((x) => x.id)).toEqual(["s2", "s1"]);
    expect(flat[0].boardName).toBe("Beta");
    expect(flat[1].boardName).toBe("Alpha");
  });
});

describe("countActiveSprints", () => {
  it("counts only active", () => {
    expect(
      countActiveSprints([
        sprint({ id: "a", boardId: "b", updatedAt: "t", status: "active" }),
        sprint({ id: "c", boardId: "b", updatedAt: "t", status: "closed" }),
      ])
    ).toBe(1);
  });
});
