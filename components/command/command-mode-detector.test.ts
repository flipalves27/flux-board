import { describe, expect, it } from "vitest";
import { detectCommandSurfaceMode } from "./command-mode-detector";

describe("detectCommandSurfaceMode", () => {
  it("returns search for empty input", () => {
    expect(detectCommandSurfaceMode("")).toBe("search");
  });

  it("detects ask-like prefixes", () => {
    expect(detectCommandSurfaceMode("/status")).toBe("ask");
    expect(detectCommandSurfaceMode("fluxy: open board")).toBe("ask");
  });

  it("detects action prefixes", () => {
    expect(detectCommandSurfaceMode(">archive")).toBe("action");
  });
});
