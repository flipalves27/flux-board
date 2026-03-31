import { describe, expect, it } from "vitest";
import { buildCopilotContext, copilotHeuristicWhenNoLlm, heuristicWeeklyBrief } from "./context-heuristics";

describe("buildCopilotContext", () => {
  it("computes execution insights from board cards", () => {
    const board = {
      config: { bucketOrder: [{ key: "todo", label: "To do" }] },
      cards: [
        { id: "c1", title: "A", bucket: "todo", progress: "Em andamento", priority: "Urgente" },
        { id: "c2", title: "B", bucket: "todo", progress: "Concluída", priority: "Média" },
      ],
    };
    const ctx = buildCopilotContext(board);
    expect(ctx.executionInsights.inProgress).toBe(1);
    expect(ctx.executionInsights.doneRate).toBe(50);
    expect(ctx.executionInsights.urgent).toBe(1);
  });
});

describe("heuristicWeeklyBrief", () => {
  it("returns non-empty markdown brief", () => {
    const text = heuristicWeeklyBrief({ name: "Board X", cards: [], dailyInsights: [] });
    expect(text).toContain("Brief semanal");
  });
});

describe("copilotHeuristicWhenNoLlm", () => {
  it("returns brief on summary prompt", () => {
    const out = copilotHeuristicWhenNoLlm({
      board: { name: "Board X", cards: [], dailyInsights: [] },
      userMessage: "resuma a semana",
    });
    expect(out.llm.source).toBe("heuristic");
    expect(out.reply).toContain("Brief semanal");
  });
});

