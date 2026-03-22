import { describe, it, expect } from "vitest";
import type { BoardData } from "@/app/board/[id]/page";
import { normalizeBoardForPersist } from "./board-persist-normalize";

describe("normalizeBoardForPersist", () => {
  it("maps unknown bucket to first column and fixes empty title", () => {
    const db: BoardData = {
      version: "1",
      lastUpdated: "t",
      cards: [
        {
          id: "c1",
          title: "   ",
          bucket: "NãoExiste",
          order: Number.NaN,
        } as BoardData["cards"][number],
      ],
      config: {
        bucketOrder: [{ key: "Backlog", label: "Backlog", color: "x" }],
        collapsedColumns: [],
      },
    };
    const n = normalizeBoardForPersist(db);
    expect(n.cards[0]?.bucket).toBe("Backlog");
    expect(n.cards[0]?.title.length).toBeGreaterThan(0);
    expect(n.cards[0]?.order).toBe(0);
  });
});
