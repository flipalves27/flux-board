import { describe, it, expect } from "vitest";
import { normalizeCommentBody } from "./kv-comments";

describe("normalizeCommentBody", () => {
  it("trims and caps length", () => {
    const long = "x".repeat(3000);
    expect(normalizeCommentBody(`  hi  `)).toBe("hi");
    expect(normalizeCommentBody(long).length).toBeLessThanOrEqual(2000);
  });
});
