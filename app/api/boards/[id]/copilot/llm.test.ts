import { describe, expect, it, vi } from "vitest";
import { callCopilotLlmModel } from "./llm";

vi.mock("@/lib/org-ai-routing", () => ({
  isOrgCloudLlmConfigured: vi.fn(() => false),
  resolveInteractiveLlmRoute: vi.fn(() => ({ route: "openai_compat", model: "" })),
}));

vi.mock("@/lib/llm-org-chat", () => ({
  runOrgLlmChat: vi.fn(),
}));

describe("callCopilotLlmModel", () => {
  it("falls back to heuristic mode when together is not configured", async () => {
    const out = await callCopilotLlmModel({
      org: {} as never,
      orgId: "org1",
      userId: "u1",
      isAdmin: false,
      board: { name: "B1", cards: [], dailyInsights: [] },
      boardName: "B1",
      userMessage: "resuma a semana",
      historyMessages: [],
      tier: "free",
      worldSnapshot: "snapshot",
    });
    expect(out.llm?.source).toBe("heuristic");
    expect(out.reply).toContain("Brief semanal");
  });
});

