import { describe, expect, it } from "vitest";
import { buildScopeSnapshotFromBoard, collectSprintScopeCardIds } from "./sprint-scope-snapshot";
import type { SprintData } from "./schemas";

describe("collectSprintScopeCardIds", () => {
  it("deduplicates ids across scope lists", () => {
    const ids = collectSprintScopeCardIds({
      cardIds: ["a", "b"],
      doneCardIds: ["b"],
      addedMidSprint: ["c"],
      removedCardIds: ["a"],
    } as Pick<SprintData, "cardIds" | "doneCardIds" | "addedMidSprint" | "removedCardIds">);
    expect(ids.sort()).toEqual(["a", "b", "c"]);
  });
});

describe("buildScopeSnapshotFromBoard", () => {
  it("builds closed snapshot with bucket order and cards", () => {
    const res = buildScopeSnapshotFromBoard({
      reason: "closed",
      sprint: {
        cardIds: ["x1"],
        doneCardIds: [],
        addedMidSprint: [],
        removedCardIds: [],
      },
      board: {
        config: { bucketOrder: [{ key: "k", label: "Col" }] },
        cards: [{ id: "x1", title: "T", bucket: "k", storyPoints: 2 }],
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.snapshot.reason).toBe("closed");
    expect(res.snapshot.bucketOrderSnapshot).toEqual([{ key: "k", label: "Col" }]);
    expect(res.snapshot.cards).toHaveLength(1);
    expect((res.snapshot.cards[0] as { id?: string }).id).toBe("x1");
  });
});
