import { describe, expect, it } from "vitest";
import {
  buildCycleTimeScatterPoints,
  computeCycleTimePercentiles,
  parseCardFlowStartMs,
} from "@/lib/flux-reports-metrics";
import type { BoardData } from "@/lib/kv-boards";

describe("computeCycleTimePercentiles", () => {
  it("returns null for empty input", () => {
    expect(computeCycleTimePercentiles([])).toBeNull();
  });

  it("interpolates percentiles", () => {
    const p = computeCycleTimePercentiles([1, 2, 3, 4, 5]);
    expect(p).not.toBeNull();
    expect(p!.p50).toBeCloseTo(3, 5);
    expect(p!.p85).toBeGreaterThan(4);
    expect(p!.p95).toBeGreaterThan(p!.p85);
  });
});

describe("parseCardFlowStartMs", () => {
  it("prefers createdAt on card", () => {
    const board = { createdAt: "2020-01-01T00:00:00.000Z" } as BoardData;
    const card = { createdAt: "2024-06-01T12:00:00.000Z" };
    const ms = parseCardFlowStartMs(card, board);
    expect(ms).toBe(new Date("2024-06-01T12:00:00.000Z").getTime());
  });
});

describe("buildCycleTimeScatterPoints", () => {
  it("emits points for concluded cards with completedAt", () => {
    const board: BoardData = {
      id: "b1",
      ownerId: "u",
      orgId: "o",
      name: "Test",
      cards: [
        {
          id: "c1",
          bucket: "Done",
          priority: "Média",
          progress: "Concluída",
          title: "A",
          desc: "",
          tags: [],
          direction: null,
          dueDate: null,
          order: 0,
          createdAt: "2024-01-01T00:00:00.000Z",
          completedAt: "2024-01-11T00:00:00.000Z",
        },
      ],
      config: {
        bucketOrder: [{ key: "Backlog", label: "Backlog", color: "#000" }],
        collapsedColumns: [],
      },
    };
    const pts = buildCycleTimeScatterPoints([board]);
    expect(pts).toHaveLength(1);
    expect(pts[0].cycleDays).toBe(10);
    expect(pts[0].boardFlowLabels).toEqual(["Backlog"]);
  });
});
