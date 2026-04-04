import { describe, it, expect } from "vitest";
import type { BoardData } from "./kv-boards";
import { computeBoardHealthScore } from "./board-health-score";

describe("computeBoardHealthScore", () => {
  it("returns graded score for empty board", () => {
    const board: BoardData = {
      id: "b1",
      orgId: "o1",
      ownerId: "u1",
      name: "Test",
      cards: [],
    };
    const h = computeBoardHealthScore(board);
    expect(h.overall).toBeGreaterThanOrEqual(0);
    expect(h.overall).toBeLessThanOrEqual(100);
    expect(h.grade).toMatch(/^[A-F]$/);
    expect(h.dimensions.length).toBeGreaterThan(0);
  });
});
