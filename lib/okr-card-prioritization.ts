/**
 * Heurística para sugerir cards que mais impactam um KR atrasado (roadmap OKR-driven prioritization).
 */

export type OkrCardLinkSuggestion = {
  cardId: string;
  title: string;
  boardId: string;
  score: number;
  reason: string;
};

export function suggestCardsForLaggingKeyResult(params: {
  krTitle: string;
  cards: Array<{ id: string; title: string; boardId: string; tags?: string[]; desc?: string }>;
  laggingPct: number;
}): OkrCardLinkSuggestion[] {
  if (params.laggingPct < 15 || !params.cards.length) return [];
  const k = params.krTitle.toLowerCase();
  const scored = params.cards.map((c) => {
    const title = c.title.toLowerCase();
    const desc = (c.desc || "").toLowerCase();
    let score = 0;
    if (title.includes(k.slice(0, 8)) || k.slice(0, 8).length >= 4 && desc.includes(k.slice(0, 8))) score += 40;
    const tags = (c.tags || []).join(" ").toLowerCase();
    if (tags && k.split(/\s+/).some((w) => w.length > 3 && tags.includes(w))) score += 25;
    if (params.laggingPct > 35) score += 15;
    return {
      cardId: c.id,
      title: c.title,
      boardId: c.boardId,
      score,
      reason:
        score > 0
          ? "Palavras-chave alinhadas ao KR; considere priorizar no backlog."
          : "Revise vínculo manual com o KR.",
    };
  });
  return scored.filter((s) => s.score >= 25).sort((a, b) => b.score - a.score).slice(0, 12);
}
