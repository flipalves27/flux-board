import { describe, expect, it } from "vitest";
import { buildExecutiveBriefAiUserPrompt } from "@/lib/board-executive-brief-ai";

describe("buildExecutiveBriefAiUserPrompt", () => {
  it("includes board name and card lines", () => {
    const p = buildExecutiveBriefAiUserPrompt({
      name: "Squad Alpha",
      cards: [
        { title: "Fix login", bucket: "Doing", priority: "Urgente", progress: "Em andamento", order: 1 },
        { title: "Docs", bucket: "Backlog", priority: "Média", progress: "Não iniciado", order: 0 },
      ],
    });
    expect(p).toContain("Squad Alpha");
    expect(p).toContain("Fix login");
    expect(p).toContain("Docs");
    expect(p).toContain("Total de cards: 2");
  });
});
