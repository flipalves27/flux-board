import { describe, expect, it } from "vitest";
import {
  validateBoardWip,
  validateBoardWipPutTransition,
  simulateMoveCardsBatch,
} from "@/lib/board-wip";

describe("validateBoardWip", () => {
  it("allows when under limit", () => {
    const r = validateBoardWip(
      [{ key: "Doing", wipLimit: 2 }],
      [{ bucket: "Doing" }, { bucket: "Backlog" }]
    );
    expect(r.ok).toBe(true);
  });

  it("rejects when over limit", () => {
    const r = validateBoardWip(
      [{ key: "Doing", wipLimit: 1 }],
      [{ bucket: "Doing" }, { bucket: "Doing" }]
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("WIP");
  });
});

describe("validateBoardWipPutTransition", () => {
  const buckets = [{ key: "Dev", wipLimit: 5 }];

  it("allows reducing count in a column already over WIP", () => {
    const prev = Array.from({ length: 22 }, (_, i) => ({ bucket: "Dev" }));
    const next = Array.from({ length: 21 }, (_, i) => ({ bucket: "Dev" }));
    const r = validateBoardWipPutTransition(buckets, prev, next);
    expect(r.ok).toBe(true);
  });

  it("allows reorder-only (same counts) when already over WIP", () => {
    const prev = Array.from({ length: 22 }, (_, i) => ({ bucket: "Dev" }));
    const next = [...prev];
    const r = validateBoardWipPutTransition(buckets, prev, next);
    expect(r.ok).toBe(true);
  });

  it("rejects increasing count in a column already over WIP", () => {
    const prev = Array.from({ length: 22 }, (_, i) => ({ bucket: "Dev" }));
    const next = Array.from({ length: 23 }, (_, i) => ({ bucket: "Dev" }));
    const r = validateBoardWipPutTransition(buckets, prev, next);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/já está acima/i);
  });

  it("still rejects crossing from compliant to over limit", () => {
    const prev = [...Array.from({ length: 5 }, () => ({ bucket: "Dev" })), { bucket: "Backlog" }];
    const next = [...Array.from({ length: 6 }, () => ({ bucket: "Dev" }))];
    const r = validateBoardWipPutTransition(buckets, prev, next);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("WIP");
  });
});

describe("simulateMoveCardsBatch", () => {
  it("moves cards and preserves order indices", () => {
    const next = simulateMoveCardsBatch(
      [
        { id: "a", bucket: "A", order: 0 },
        { id: "b", bucket: "B", order: 0 },
      ],
      ["b"],
      "A",
      0
    );
    expect(next.find((c) => c.id === "b")?.bucket).toBe("A");
    const inA = next.filter((c) => c.bucket === "A").sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    expect(inA.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
