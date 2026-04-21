import { describe, expect, it } from "vitest";
import { extractVoiceToBoardSuggestions } from "./daily-voice-extract";

describe("extractVoiceToBoardSuggestions", () => {
  it("matches card title in transcript", () => {
    const cards = [
      { id: "c1", title: "Integração API pagamentos" },
      { id: "c2", title: "Outro assunto" },
    ];
    const t =
      "Ontem trabalhei na integração api pagamentos e hoje continuo nela. Bloqueio no ambiente de homologação.";
    const out = extractVoiceToBoardSuggestions(t, cards, { minScore: 0.2, limit: 5 });
    expect(out.some((x) => x.cardId === "c1")).toBe(true);
    expect(out.find((x) => x.cardId === "c1")?.hints).toContain("possible_blocker");
  });
});
