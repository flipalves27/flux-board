import { describe, it, expect } from "vitest";
import type { BoardData } from "@/app/board/[id]/page";
import { BoardUpdateSchema } from "@/lib/schemas";
import { normalizeBoardForPersist } from "./board-persist-normalize";

describe("normalizeBoardForPersist", () => {
  it("maps column label to bucket key (not only exact key)", () => {
    const db: BoardData = {
      version: "1",
      lastUpdated: "t",
      cards: [
        {
          id: "c1",
          title: "Card",
          bucket: "Em desenvolvimento",
          order: 0,
        } as BoardData["cards"][number],
      ],
      config: {
        bucketOrder: [
          { key: "backlog", label: "Backlog", color: "x" },
          { key: "desenvolvimento", label: "Em desenvolvimento", color: "y" },
        ],
        collapsedColumns: [],
      },
    };
    const n = normalizeBoardForPersist(db);
    expect(n.cards[0]?.bucket).toBe("desenvolvimento");
  });

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

  it("strips invalid intakeForm strings (empty slug / empty required-ish fields) so PUT passes schema", () => {
    const db = {
      version: "1",
      lastUpdated: "t",
      intakeForm: { enabled: true, slug: "", title: "OK", targetBucketKey: "   " },
      cards: [
        {
          id: "c1",
          title: "Card",
          bucket: "Backlog",
          priority: "Média",
          progress: "Não iniciado",
          desc: "",
          tags: [],
          order: 0,
        },
      ],
      config: {
        bucketOrder: [{ key: "Backlog", label: "Backlog", color: "var(--flux-primary)" }],
        collapsedColumns: [],
      },
    } as unknown as BoardData;
    const n = normalizeBoardForPersist(db);
    const parsed = BoardUpdateSchema.safeParse({ ...n, lastUpdated: new Date().toISOString() });
    expect(parsed.success).toBe(true);
  });

  it("strips portal null, bad dailyInsights and null intake fields so PUT passes schema", () => {
    const db = {
      version: "1",
      lastUpdated: "t",
      portal: null,
      dailyInsights: [{ id: "" }, { id: "ok", insight: {} }],
      intakeForm: { enabled: true, slug: null, title: "Flux Forms" },
      cards: [
        {
          id: "c1",
          title: "Card",
          bucket: "Backlog",
          priority: "Média",
          progress: "Não iniciado",
          desc: "",
          tags: [],
          order: 0,
        },
      ],
      config: {
        bucketOrder: [{ key: "Backlog", label: "Backlog", color: "var(--flux-primary)" }],
        collapsedColumns: [],
      },
    } as unknown as BoardData;
    const n = normalizeBoardForPersist(db);
    expect(n.portal).toBeUndefined();
    expect(n.dailyInsights?.length).toBe(1);
    expect(n.dailyInsights?.[0]?.id).toBe("ok");
    const parsed = BoardUpdateSchema.safeParse({ ...n, lastUpdated: new Date().toISOString() });
    expect(parsed.success).toBe(true);
  });

  it("strips invalid matrix band / coerces assigneeId so PUT passes Zod (evita 400 ao salvar)", () => {
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
          assigneeId: 58 as unknown as string,
          order: 0,
          matrixWeight: 150,
          matrixWeightBand: "super-high" as unknown as "high",
        } as BoardData["cards"][number],
      ],
      config: {
        bucketOrder: [{ key: "Backlog", label: "Backlog", color: "var(--flux-primary)" }],
        collapsedColumns: [],
      },
    };
    const n = normalizeBoardForPersist(db);
    expect(n.cards[0]?.assigneeId).toBe("58");
    expect(n.cards[0]?.matrixWeight).toBe(100);
    expect(n.cards[0]?.matrixWeightBand).toBeUndefined();
    const parsed = BoardUpdateSchema.safeParse({ ...n, lastUpdated: new Date().toISOString() });
    expect(parsed.success).toBe(true);
  });

  it("preserves boardMethodology lean_six_sigma", () => {
    const db: BoardData = {
      version: "1",
      lastUpdated: "t",
      boardMethodology: "lean_six_sigma",
      cards: [],
      config: {
        bucketOrder: [{ key: "define", label: "Define", color: "var(--flux-primary)" }],
        collapsedColumns: [],
      },
    };
    const n = normalizeBoardForPersist(db);
    expect(n.boardMethodology).toBe("lean_six_sigma");
    const parsed = BoardUpdateSchema.safeParse({ ...n, lastUpdated: new Date().toISOString() });
    expect(parsed.success).toBe(true);
  });
});
