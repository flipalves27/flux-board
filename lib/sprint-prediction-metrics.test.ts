import { describe, expect, it } from "vitest";
import {
  backtestWeeklyThroughputP85,
  createSeededRandom,
  monteCarloThroughputPercentiles,
  percentileSorted,
} from "@/lib/sprint-prediction-metrics";

describe("percentileSorted", () => {
  it("interpolates", () => {
    const s = [1, 2, 3, 4, 5];
    expect(percentileSorted(s, 50)).toBe(3);
    expect(percentileSorted(s, 100)).toBe(5);
  });
});

describe("monteCarloThroughputPercentiles", () => {
  it("is deterministic with seed", () => {
    const rand = createSeededRandom(42);
    const a = monteCarloThroughputPercentiles([2, 4, 6, 8], 500, rand);
    const rand2 = createSeededRandom(42);
    const b = monteCarloThroughputPercentiles([2, 4, 6, 8], 500, rand2);
    expect(a.p50).toBe(b.p50);
    expect(a.p85).toBe(b.p85);
  });
});

describe("backtestWeeklyThroughputP85", () => {
  it("evaluates last 4 windows with 8 weeks of data", () => {
    const weekly = [1, 2, 3, 4, 5, 6, 7, 8];
    const rand = createSeededRandom(99);
    const r = backtestWeeklyThroughputP85(weekly, 200, rand);
    expect(r.windows).toBe(4);
    expect(r.accuracy).toBeGreaterThanOrEqual(0);
    expect(r.accuracy).toBeLessThanOrEqual(1);
  });

  it("passes when actuals stay at or below conservative P85", () => {
    const weekly = [3, 3, 3, 3, 3, 3, 3, 3];
    const rand = createSeededRandom(1);
    const r = backtestWeeklyThroughputP85(weekly, 1000, rand);
    expect(r.windows).toBe(4);
    expect(r.accuracy).toBe(1);
    expect(r.passes).toBe(true);
  });
});
