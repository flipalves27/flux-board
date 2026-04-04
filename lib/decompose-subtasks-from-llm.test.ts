import { describe, expect, it } from "vitest";
import { parseDecomposeSubtasksFromAssistant } from "@/lib/decompose-subtasks-from-llm";

describe("parseDecomposeSubtasksFromAssistant", () => {
  it("parses wrapped JSON and normalizes priority", () => {
    const raw = `Here is JSON:\n{"subtasks":[{"title":"Task one","priority":"high","estimateHours":2},{"title":"x","priority":"nope","estimateHours":null}]}`;
    const out = parseDecomposeSubtasksFromAssistant(raw);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe("Task one");
    expect(out[0].priority).toBe("high");
    expect(out[1].priority).toBe("medium");
  });

  it("returns empty on garbage", () => {
    expect(parseDecomposeSubtasksFromAssistant("no json")).toEqual([]);
  });
});
