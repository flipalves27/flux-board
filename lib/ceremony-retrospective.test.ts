import { describe, it, expect } from "vitest";

describe("ceremony-retrospective", () => {
  it("exports generateRetrospective", async () => {
    const mod = await import("./ceremony-retrospective");
    expect(typeof mod.generateRetrospective).toBe("function");
  });
});
