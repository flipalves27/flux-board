import { describe, expect, it } from "vitest";
import { sliceCopilotMessagesForLlm, type CopilotMessage } from "./kv-board-copilot";

describe("sliceCopilotMessagesForLlm", () => {
  it("keeps last N user/assistant messages", () => {
    const messages: CopilotMessage[] = Array.from({ length: 30 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `c${i}`,
      createdAt: new Date().toISOString(),
    }));
    const sliced = sliceCopilotMessagesForLlm(messages, 6);
    expect(sliced.length).toBe(6);
    expect(sliced[0].content).toBe("c24");
    expect(sliced[5].content).toBe("c29");
  });
});
