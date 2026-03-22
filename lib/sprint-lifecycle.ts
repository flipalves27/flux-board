import type { BurndownSnapshot } from "./schemas";

export function computeDoneCardIdsForSprintCards(
  sprintCardIds: string[],
  cards: Array<Record<string, unknown>>
): string[] {
  return sprintCardIds.filter((cid) => {
    const card = cards.find((c) => c.id === cid);
    return card && String(card.progress ?? "") === "Concluída";
  });
}

export function computeCarryoverCardIds(sprintCardIds: string[], doneCardIds: string[]): string[] {
  const done = new Set(doneCardIds);
  return sprintCardIds.filter((id) => !done.has(id));
}

const MAX_TAGS = 30;

export function applyCarryoverTagToBoardCards(cards: unknown[], carryoverIds: ReadonlySet<string>): unknown[] {
  if (!carryoverIds.size) return cards;
  return cards.map((raw) => {
    const c = raw as Record<string, unknown>;
    const id = String(c.id ?? "");
    if (!id || !carryoverIds.has(id)) return raw;
    const prev = Array.isArray(c.tags) ? (c.tags as unknown[]).map(String) : [];
    if (prev.includes("carryover")) return raw;
    return { ...c, tags: [...prev, "carryover"].slice(0, MAX_TAGS) };
  });
}

/** Final row when closing sprint (review → closed): remaining = open commitment. */
export function buildClosingBurndownSnapshot(params: {
  date: string;
  remainingCards: number;
}): BurndownSnapshot {
  return {
    date: params.date,
    remainingCards: params.remainingCards,
    completedToday: 0,
    addedToday: 0,
    idealRemaining: 0,
  };
}
