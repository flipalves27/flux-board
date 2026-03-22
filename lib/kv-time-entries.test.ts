import { describe, it, expect } from "vitest";
import { computeElapsedMinutes } from "./kv-time-entries";

describe("computeElapsedMinutes", () => {
  it("returns non-negative whole minutes", () => {
    expect(computeElapsedMinutes("2026-03-22T10:00:00.000Z", "2026-03-22T10:45:00.000Z")).toBe(45);
  });
});
