import { describe, expect, it, vi } from "vitest";
import { trackFluxyEvent } from "./fluxy-telemetry";

describe("trackFluxyEvent", () => {
  it("dispatches browser custom event when window exists", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    trackFluxyEvent({
      event: "fluxy_dock_opened",
      mode: "workspace",
      state: "talking",
      origin: "workspace",
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

