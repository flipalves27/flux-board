import { describe, expect, it } from "vitest";
import { mergeBucketOrdersForWipResolve } from "@/lib/board-bucket-resolve";
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

  it("counts cards stored with column label against the bucket key limit", () => {
    const r = validateBoardWip(
      [{ key: "dev", label: "Em desenvolvimento", wipLimit: 2 }],
      [{ bucket: "Em desenvolvimento" }, { bucket: "Em desenvolvimento" }, { bucket: "Em desenvolvimento" }]
    );
    expect(r.ok).toBe(false);
  });
});

describe("validateBoardWipPutTransition", () => {
  const buckets = [{ key: "Dev", wipLimit: 5 }];
  const bucketsWithBacklogFirst = [
    { key: "Backlog", label: "Backlog" },
    { key: "Dev", wipLimit: 5 },
  ];

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
    const r = validateBoardWipPutTransition(bucketsWithBacklogFirst, prev, next);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("WIP");
  });

  it("counts cards by column label toward the bucket key WIP (legacy / inconsistent bucket strings)", () => {
    const cols = [{ key: "desenvolvimento", label: "Em desenvolvimento", wipLimit: 5 }];
    const prev = Array.from({ length: 22 }, () => ({ bucket: "Em desenvolvimento" }));
    const next = Array.from({ length: 21 }, () => ({ bucket: "Em desenvolvimento" }));
    const r = validateBoardWipPutTransition(cols, prev, next);
    expect(r.ok).toBe(true);
  });

  it("rejects adding a card when label and key both map to an already-over WIP column", () => {
    const cols = [{ key: "desenvolvimento", label: "Em desenvolvimento", wipLimit: 5 }];
    const prev = Array.from({ length: 22 }, () => ({ bucket: "Em desenvolvimento" }));
    const next = [
      ...Array.from({ length: 22 }, () => ({ bucket: "Em desenvolvimento" })),
      { bucket: "desenvolvimento" },
    ];
    const r = validateBoardWipPutTransition(cols, prev, next);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/já está acima|Remova cards/i);
  });

  it("com merge KV+PUT, label antigo no prev e key no next não dispara primeiro crossing falso", () => {
    const merged = mergeBucketOrdersForWipResolve(
      [{ key: "desenvolvimento", label: "Em desenvolvimento (legado)", wipLimit: 5 }],
      [{ key: "desenvolvimento", label: "Em desenvolvimento", wipLimit: 5 }]
    );
    const prev = Array.from({ length: 23 }, () => ({ bucket: "Em desenvolvimento (legado)" }));
    const next = Array.from({ length: 23 }, () => ({ bucket: "desenvolvimento" }));
    const r = validateBoardWipPutTransition(merged, prev, next);
    expect(r.ok).toBe(true);
  });

  it("aligns prev vs next when legacy slug buckets share first column with WIP (falso 400 em produção)", () => {
    const cols = [
      { key: "desenvolvimento", label: "Em desenvolvimento", wipLimit: 5 },
      { key: "done", label: "Feito" },
    ];
    const prev = [
      ...Array.from({ length: 5 }, () => ({ bucket: "desenvolvimento" })),
      ...Array.from({ length: 18 }, () => ({ bucket: "slug_legado_nao_existe" })),
    ];
    const next = Array.from({ length: 23 }, () => ({ bucket: "desenvolvimento" }));
    const r = validateBoardWipPutTransition(cols, prev, next);
    expect(r.ok).toBe(true);
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
