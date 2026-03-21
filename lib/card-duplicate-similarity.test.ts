import { describe, expect, it } from "vitest";
import {
  findSimilarBoardCards,
  levenshteinRatio,
  normalizeForDuplicateTitle,
  shouldSuppressDuplicateSuggestion,
} from "./card-duplicate-similarity";
import type { BoardData } from "./kv-boards";

function makeBoard(cards: Array<{ id: string; title: string; desc?: string; bucket?: string }>): BoardData {
  return {
    id: "b1",
    ownerId: "u1",
    orgId: "o1",
    name: "Test",
    config: {
      bucketOrder: [
        { key: "Backlog", label: "Backlog", color: "#000" },
        { key: "Doing", label: "Doing", color: "#000" },
      ],
      collapsedColumns: [],
    },
    cards: cards.map((c, i) => ({
      id: c.id,
      title: c.title,
      desc: c.desc ?? "",
      bucket: c.bucket ?? "Backlog",
      priority: "Média",
      progress: "Não iniciado",
      tags: [],
      direction: null,
      dueDate: null,
      order: i,
    })),
  };
}

describe("shouldSuppressDuplicateSuggestion", () => {
  it("suppresses generic single-word titles", () => {
    expect(shouldSuppressDuplicateSuggestion("Reunião")).toBe(true);
    expect(shouldSuppressDuplicateSuggestion("Bug")).toBe(true);
    expect(shouldSuppressDuplicateSuggestion("ab")).toBe(true);
  });

  it("allows specific multi-word titles", () => {
    expect(shouldSuppressDuplicateSuggestion("Reunião com cliente X")).toBe(false);
    expect(shouldSuppressDuplicateSuggestion("Bug no checkout PIX")).toBe(false);
  });
});

describe("levenshteinRatio", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinRatio(normalizeForDuplicateTitle("abc"), normalizeForDuplicateTitle("abc"))).toBe(0);
  });
});

describe("findSimilarBoardCards", () => {
  it("returns empty for suppressed titles", () => {
    const board = makeBoard([{ id: "1", title: "Other", desc: "x" }]);
    expect(findSimilarBoardCards({ board, queryTitle: "Bug", queryDescription: "" }).length).toBe(0);
  });

  it("finds near-duplicate titles", () => {
    const board = makeBoard([
      { id: "a", title: "Implementar filtro de data no relatório", desc: "detalhes do escopo" },
      { id: "b", title: "Outro card", desc: "nada a ver" },
    ]);
    const r = findSimilarBoardCards({
      board,
      queryTitle: "Implementar filtro de data no relatorio",
      queryDescription: "escopo",
      limit: 3,
    });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].cardId).toBe("a");
  });
});
