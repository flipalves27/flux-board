import type { BoardData } from "@/lib/kv-boards";

export type CardRiskFactors = {
  columnStagnationDays: number;
  daysUntilDue: number | null;
  blockedHint: boolean;
};

/**
 * Score 0–100 de risco de atraso/atrito (heurística local, sem LLM).
 * Pode ser exibido como badge e refinado com embeddings/dependências depois.
 */
export function computeCardRiskScore(
  card: Record<string, unknown>,
  factors: CardRiskFactors
): number {
  let score = 20;

  const stagn = Math.min(30, factors.columnStagnationDays * 2);
  score += stagn;

  if (factors.daysUntilDue !== null) {
    if (factors.daysUntilDue < 0) score += 35;
    else if (factors.daysUntilDue <= 2) score += 25;
    else if (factors.daysUntilDue <= 7) score += 12;
  }

  if (factors.blockedHint) score += 15;

  const title = typeof card.title === "string" ? card.title : "";
  if (/\b(bloquead|block|depend|risc)\b/i.test(title)) score += 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Estimativa simples de dias na coluna a partir de histórico em card (quando existir). */
export function inferStagnationDaysFromCard(card: Record<string, unknown>, nowMs: number): number {
  const moved = card.lastMovedAt ?? card.updatedAt;
  if (typeof moved !== "string" || !moved) return 0;
  const t = new Date(moved).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86400000));
}

export function cardRecordFromBoard(board: BoardData, cardId: string): Record<string, unknown> | null {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const c = cards.find((x) => x && typeof x === "object" && String((x as { id?: string }).id) === cardId);
  return c && typeof c === "object" ? (c as Record<string, unknown>) : null;
}
