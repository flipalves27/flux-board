import { describe, it, expect } from "vitest";
import type { BoardData } from "./kv-boards";
import { countBoardCardsNotDone } from "./sprint-planning-ai";

describe("countBoardCardsNotDone", () => {
  it("excludes Concluída", () => {
    const board: BoardData = {
      id: "b",
      orgId: "o",
      ownerId: "u",
      name: "B",
      cards: [{ progress: "Concluída" }, { progress: "Doing" }, {}],
    };
    expect(countBoardCardsNotDone(board)).toBe(2);
  });
});
