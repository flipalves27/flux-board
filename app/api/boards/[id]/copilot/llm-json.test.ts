import { describe, expect, it } from "vitest";
import { parseJsonFromLlmContent } from "./llm-json";

describe("parseJsonFromLlmContent", () => {
  it("parses direct JSON", () => {
    const out = parseJsonFromLlmContent('{"reply":"ok","actions":[]}');
    expect((out.parsed as { reply: string }).reply).toBe("ok");
    expect(out.recovered).toBe(false);
  });

  it("recovers JSON when wrapped in text", () => {
    const out = parseJsonFromLlmContent('texto antes {"reply":"ok","actions":[{"tool":"generateBrief","args":{}}]} texto');
    expect((out.parsed as { reply: string }).reply).toBe("ok");
    expect(out.recovered).toBe(true);
  });
});

