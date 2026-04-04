import { describe, it, expect } from "vitest";
import { computeBurndownSnapshotForSprintDate } from "./sprint-burndown-daily";

describe("computeBurndownSnapshotForSprintDate", () => {
  it("returns null without dates", () => {
    expect(
      computeBurndownSnapshotForSprintDate({
        sprint: { startDate: null, endDate: null, cardIds: ["a"] },
        cards: [{ id: "a", progress: "Open" }],
        snapshotDate: "2026-03-10",
      })
    ).toBeNull();
  });

  it("drops remaining after completion by end of day", () => {
    const snap = computeBurndownSnapshotForSprintDate({
      sprint: {
        startDate: "2026-03-01",
        endDate: "2026-03-10",
        cardIds: ["a"],
      },
      cards: [{ id: "a", completedAt: "2026-03-09T15:00:00.000Z" }],
      snapshotDate: "2026-03-09",
    });
    expect(snap).not.toBeNull();
    expect(snap!.remainingCards).toBe(0);
  });
});
