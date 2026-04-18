import { describe, expect, it } from "vitest";
import { pickProactiveNudge } from "./fluxy-proactive-rules";

describe("pickProactiveNudge", () => {
  it("returns null inside cooldown", () => {
    expect(pickProactiveNudge({ wipCount: 99, lastNudgeAt: Date.now() })).toBeNull();
  });

  it("returns nudge when WIP high and cooldown elapsed", () => {
    const n = pickProactiveNudge({ wipCount: 30, lastNudgeAt: Date.now() - 31 * 60 * 1000 });
    expect(n?.kind).toBe("stale_wip");
  });
});
