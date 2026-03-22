import { describe, it, expect } from "vitest";
import { sprintDeliveredVsCommitment } from "./sprint-delivery-metrics";

describe("sprintDeliveredVsCommitment", () => {
  it("uses velocity when set", () => {
    const r = sprintDeliveredVsCommitment({ cardIds: ["a", "b", "c"], velocity: 2 }, 99);
    expect(r.delivered).toBe(2);
    expect(r.pct).toBe(67);
  });

  it("falls back to done count when velocity null", () => {
    const r = sprintDeliveredVsCommitment({ cardIds: ["a", "b"], velocity: null }, 1);
    expect(r.delivered).toBe(1);
    expect(r.pct).toBe(50);
  });
});
