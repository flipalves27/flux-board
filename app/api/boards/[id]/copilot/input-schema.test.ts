import { describe, expect, it } from "vitest";
import { parseCopilotChatInput } from "./input-schema";

describe("parseCopilotChatInput", () => {
  it("accepts valid message and debug flag", () => {
    const res = parseCopilotChatInput({ message: "  mover card  ", debug: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.userMessage).toBe("mover card");
    expect(res.data.debugRag).toBe(true);
  });

  it("rejects empty message", () => {
    const res = parseCopilotChatInput({ message: "   " });
    expect(res.ok).toBe(false);
  });
});

