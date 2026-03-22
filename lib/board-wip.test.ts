import { describe, expect, it } from "vitest";
import { validateBoardWip, simulateMoveCardsBatch } from "@/lib/board-wip";

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
