import { describe, expect, it } from "vitest";
import { fluxyVisualStateCopy } from "./fluxy-visual-state-copy";

describe("fluxyVisualStateCopy", () => {
  it("resolves keys via translator", () => {
    const t = (key: string) => `T:${key}`;
    expect(fluxyVisualStateCopy("idle", t)).toEqual({
      emoji: "T:visualState.idle.emoji",
      label: "T:visualState.idle.label",
      desc: "T:visualState.idle.desc",
    });
  });
});
