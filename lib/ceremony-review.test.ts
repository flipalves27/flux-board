import { describe, it, expect } from "vitest";

describe("ceremony-review", () => {
  it("exports generateSprintReview", async () => {
    const mod = await import("./ceremony-review");
    expect(typeof mod.generateSprintReview).toBe("function");
  });
});
