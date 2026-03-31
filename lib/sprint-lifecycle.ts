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

export function computeVelocityFromDoneCards(
  doneCardIds: readonly string[],
  cards: Array<Record<string, unknown>>
): number {
  if (!doneCardIds.length) return 0;
  const doneSet = new Set(doneCardIds);
  let hasStoryPoints = false;
  let storyPointsTotal = 0;
  for (const card of cards) {
    const id = String(card.id ?? "");
    if (!id || !doneSet.has(id)) continue;
    const raw = card.storyPoints;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
      hasStoryPoints = true;
      storyPointsTotal += raw;
    }
  }
  return hasStoryPoints ? storyPointsTotal : doneCardIds.length;
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

/** First row when sprint starts (baseline t0). */
export function buildStartBurndownSnapshot(params: {
  date: string;
  remainingCards: number;
}): BurndownSnapshot {
  return {
    date: params.date,
    remainingCards: params.remainingCards,
    completedToday: 0,
    addedToday: 0,
    idealRemaining: params.remainingCards,
  };
}
