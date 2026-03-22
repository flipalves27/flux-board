import { describe, it, expect } from "vitest";
import {
  applyCarryoverTagToBoardCards,
  buildClosingBurndownSnapshot,
  computeCarryoverCardIds,
  computeDoneCardIdsForSprintCards,
} from "./sprint-lifecycle";

describe("computeDoneCardIdsForSprintCards", () => {
  it("keeps only Concluída cards in sprint scope", () => {
    const cards = [
      { id: "a", progress: "Concluída" },
      { id: "b", progress: "Doing" },
      { id: "c", progress: "Concluída" },
    ] as Array<Record<string, unknown>>;
    expect(computeDoneCardIdsForSprintCards(["a", "b", "c"], cards)).toEqual(["a", "c"]);
  });
});

describe("computeCarryoverCardIds", () => {
  it("returns cards in sprint but not done", () => {
    expect(computeCarryoverCardIds(["a", "b", "c"], ["a"])).toEqual(["b", "c"]);
  });
});

describe("applyCarryoverTagToBoardCards", () => {
  it("adds carryover tag once", () => {
    const out = applyCarryoverTagToBoardCards(
      [{ id: "x", tags: ["bug"] }, { id: "y", tags: [] }],
      new Set(["x"])
    ) as Array<{ id: string; tags: string[] }>;
    expect(out[0].tags).toContain("carryover");
    expect(out[1].tags).toEqual([]);
  });

  it("skips when set empty", () => {
    const orig = [{ id: "x" }];
    expect(applyCarryoverTagToBoardCards(orig, new Set())).toBe(orig);
  });
});

describe("buildClosingBurndownSnapshot", () => {
  it("sets ideal to zero at close", () => {
    const s = buildClosingBurndownSnapshot({ date: "2026-03-22", remainingCards: 3 });
    expect(s).toMatchObject({
      date: "2026-03-22",
      remainingCards: 3,
      idealRemaining: 0,
      completedToday: 0,
      addedToday: 0,
    });
  });
});
