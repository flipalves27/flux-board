import { describe, it, expect } from "vitest";
import { clipStandupDate } from "./kv-standup";

describe("clipStandupDate", () => {
  it("truncates to YYYY-MM-DD", () => {
    expect(clipStandupDate("2026-03-22T12:00:00Z")).toBe("2026-03-22");
  });
});
