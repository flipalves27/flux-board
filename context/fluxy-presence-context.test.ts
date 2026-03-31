import { describe, expect, it } from "vitest";
import { resolveFluxyVisualState } from "./fluxy-presence-context";

describe("resolveFluxyVisualState", () => {
  it("prioritizes listening/writing over all other states", () => {
    expect(resolveFluxyVisualState({ isListening: true, isCelebrating: true })).toBe("talking");
    expect(resolveFluxyVisualState({ isWriting: true, isGenerating: true })).toBe("talking");
  });

  it("maps worried conditions before celebration/generation", () => {
    expect(resolveFluxyVisualState({ isWipViolated: true, isCelebrating: true })).toBe("thinking");
    expect(resolveFluxyVisualState({ isCriticalDelay: true })).toBe("thinking");
    expect(resolveFluxyVisualState({ isAnomalyHigh: true })).toBe("thinking");
  });

  it("keeps celebration and open/generation fallbacks", () => {
    expect(resolveFluxyVisualState({ isCelebrating: true })).toBe("celebrating");
    expect(resolveFluxyVisualState({ isGenerating: true })).toBe("thinking");
    expect(resolveFluxyVisualState({ isOpen: true })).toBe("talking");
    expect(resolveFluxyVisualState({ isFirstOpen: true })).toBe("waving");
  });
});

