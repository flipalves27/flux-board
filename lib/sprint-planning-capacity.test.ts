import { describe, it, expect } from "vitest";
import { computeRoughCapacityPoints, countWeekdaysInclusive } from "./sprint-planning-capacity";

describe("countWeekdaysInclusive", () => {
  it("counts Mon–Fri in one week", () => {
    expect(countWeekdaysInclusive("2026-03-02", "2026-03-06")).toBe(5);
  });

  it("returns 0 for invalid order", () => {
    expect(countWeekdaysInclusive("2026-03-10", "2026-03-01")).toBe(0);
  });
});

describe("computeRoughCapacityPoints", () => {
  it("applies focus factor", () => {
    expect(computeRoughCapacityPoints({ memberCount: 5, sprintWeekdays: 10, focusFactor: 0.7 })).toBe(35);
  });
});
