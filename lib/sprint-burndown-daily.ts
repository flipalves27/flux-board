import type { BurndownSnapshot, SprintData } from "./schemas";

/**
 * One burndown row for a calendar day within the sprint window (aligned with legacy GET burndown math).
 */
export function computeBurndownSnapshotForSprintDate(params: {
  sprint: Pick<SprintData, "startDate" | "endDate" | "cardIds">;
  cards: Array<Record<string, unknown>>;
  snapshotDate: string;
}): BurndownSnapshot | null {
  const { sprint, cards, snapshotDate } = params;
  if (!sprint.startDate || !sprint.endDate) return null;

  const startDate = new Date(sprint.startDate + "T00:00:00");
  const endDate = new Date(sprint.endDate + "T00:00:00");
  const target = new Date(snapshotDate + "T00:00:00");
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || Number.isNaN(target.getTime())) {
    return null;
  }

  const sprintCards = sprint.cardIds
    .map((cid) => cards.find((c) => String(c.id) === cid))
    .filter(Boolean) as Array<Record<string, unknown>>;
  const total = sprintCards.length;
  if (total === 0) return null;

  const dayMs = 86400000;
  const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / dayMs));
  const dRaw = Math.round((target.getTime() - startDate.getTime()) / dayMs);
  const dClamped = Math.max(0, Math.min(durationDays, dRaw));
  const dayTs = startDate.getTime() + dClamped * dayMs;

  const ideal = Math.max(0, total - (total / durationDays) * dClamped);

  const doneByEndOfDay = sprintCards.filter((c) => {
    const completedAt = typeof c.completedAt === "string" ? c.completedAt : null;
    if (!completedAt) return false;
    return new Date(completedAt).getTime() <= dayTs + dayMs;
  }).length;

  const remainingCards = total - doneByEndOfDay;

  const dayStart = dayTs;
  const dayEndExclusive = dayTs + dayMs;
  const completedToday = sprintCards.filter((c) => {
    const completedAt = typeof c.completedAt === "string" ? c.completedAt : null;
    if (!completedAt) return false;
    const t = new Date(completedAt).getTime();
    return t >= dayStart && t < dayEndExclusive;
  }).length;

  return {
    date: snapshotDate,
    remainingCards,
    completedToday,
    addedToday: 0,
    idealRemaining: Math.round(ideal * 10) / 10,
  };
}
