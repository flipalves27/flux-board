import { describe, expect, it } from "vitest";
import {
  buildExecutiveBriefAiUserPrompt,
  parseExecutiveRankJustifyLines,
} from "@/lib/board-executive-brief-ai";

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

  it("requires decision-oriented markdown sections", () => {
    const p = buildExecutiveBriefAiUserPrompt({
      name: "B",
      cards: [{ title: "X", bucket: "A", priority: "Média", progress: "Não iniciado", order: 0 }],
    });
    expect(p).toContain("## Decisões pedidas ao comité");
    expect(p).toContain("## Riscos com prazo");
    expect(p).toContain("## Dependências externas");
    expect(p).toContain("deps_internas:");
  });
});

describe("parseExecutiveRankJustifyLines", () => {
  it("parses ID|TEXTO lines", () => {
    const text = `ID=abc|TEXTO=Primeira frase.\nID=def|TEXTO=Segunda.`;
    const out = parseExecutiveRankJustifyLines(text, ["abc", "def"]);
    expect(out.abc).toBe("Primeira frase.");
    expect(out.def).toBe("Segunda.");
  });
});
