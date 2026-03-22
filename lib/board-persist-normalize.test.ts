import { describe, it, expect } from "vitest";
import type { BoardData } from "@/app/board/[id]/page";
import { BoardUpdateSchema } from "@/lib/schemas";
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

  it("strips null optional fields so PUT body passes BoardUpdateSchema (Zod optional ≠ null)", () => {
    const db: BoardData = {
      version: "1",
      lastUpdated: "t",
      cards: [
        {
          id: "c1",
          title: "Card",
          bucket: "Backlog",
          priority: "Média",
          progress: "Não iniciado",
          desc: "",
          tags: [],
          direction: null,
          dueDate: null,
          order: 0,
          columnEnteredAt: null,
          completedAt: null,
          completedCycleDays: null,
          automationState: null,
          dorReady: null,
          subtaskProgress: null,
        } as unknown as BoardData["cards"][number],
      ],
      config: {
        bucketOrder: [{ key: "Backlog", label: "Backlog", color: "var(--flux-primary)" }],
        collapsedColumns: [],
      },
    };
    const n = normalizeBoardForPersist(db);
    const parsed = BoardUpdateSchema.safeParse({ ...n, lastUpdated: new Date().toISOString() });
    expect(parsed.success).toBe(true);
  });
});
