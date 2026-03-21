import { describe, expect, it } from "vitest";
import {
  buildCfdDailyChartRows,
  detectWipRising,
  enumerateDaysInclusive,
  mergeSnapshotsIntoByDay,
  normalizeCfdKeys,
} from "@/lib/cfd-daily-from-snapshots";

describe("cfd-daily-from-snapshots", () => {
  it("enumerateDaysInclusive returns inclusive range", () => {
    const days = enumerateDaysInclusive("2025-03-01", "2025-03-03");
    expect(days).toEqual(["2025-03-01", "2025-03-02", "2025-03-03"]);
  });

  it("mergeSnapshotsIntoByDay sums wip and done across boards", () => {
    const m = mergeSnapshotsIntoByDay([
      { day: "2025-03-01", wipByBucket: { a: 2, b: 1 }, doneCount: 3 },
      { day: "2025-03-01", wipByBucket: { a: 1 }, doneCount: 1 },
    ]);
    expect(m.get("2025-03-01")).toEqual({ a: 3, b: 1, __done__: 4 });
  });

  it("normalizeCfdKeys orders extras and appends done", () => {
    const raw = new Map<string, Record<string, number>>([
      ["2025-03-01", { z: 1, __done__: 2 }],
    ]);
    const keys = normalizeCfdKeys(["b", "a"], raw);
    expect(keys[keys.length - 1]).toBe("__done__");
    expect(keys).toContain("z");
  });

  it("detectWipRising compares first vs last third", () => {
    const keys = ["a", "__done__"];
    const rising = Array.from({ length: 12 }, (_, i) => ({
      day: `d${i}`,
      dayLabel: "",
      a: i < 4 ? 2 : 10,
      __done__: 0,
    }));
    expect(detectWipRising(rising, keys)).toBe(true);

    const flat = Array.from({ length: 12 }, (_, i) => ({
      day: `d${i}`,
      dayLabel: "",
      a: 5,
      __done__: 0,
    }));
    expect(detectWipRising(flat, keys)).toBe(false);
  });

  it("buildCfdDailyChartRows forward-fills missing days", () => {
    const byDayRaw = new Map<string, Record<string, number>>([
      ["2025-03-01", { a: 1, __done__: 0 }],
    ]);
    const allDays = ["2025-03-01", "2025-03-02"];
    const { rows } = buildCfdDailyChartRows({
      keys: ["a", "__done__"],
      byDayRaw,
      allDays,
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]?.a).toBe(1);
  });
});
