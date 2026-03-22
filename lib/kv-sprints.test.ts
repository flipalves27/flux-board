import { describe, it, expect } from "vitest";
import { normalizeSprintData } from "./kv-sprints";
import type { SprintData } from "./schemas";

describe("normalizeSprintData", () => {
  it("fills missing burndown and scope arrays for legacy docs", () => {
    const legacy = {
      id: "spr_1",
      orgId: "o1",
      boardId: "b1",
      name: "S",
      goal: "",
      status: "active" as const,
      startDate: null,
      endDate: null,
      velocity: null,
      cardIds: [],
      doneCardIds: [],
      ceremonyIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as unknown as SprintData;
    const n = normalizeSprintData(legacy);
    expect(n.burndownSnapshots).toEqual([]);
    expect(n.addedMidSprint).toEqual([]);
    expect(n.removedCardIds).toEqual([]);
  });
});
