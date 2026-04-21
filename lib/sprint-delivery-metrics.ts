import type { SprintData } from "./schemas";

export function sprintDeliveredVsCommitment(
  sprint: Pick<SprintData, "cardIds" | "velocity">,
  doneCardCount: number
): { commitment: number; delivered: number; pct: number } {
  const commitment = sprint.cardIds.length;
  const delivered = sprint.velocity ?? doneCardCount;
  const pct = commitment > 0 ? Math.round((delivered / commitment) * 100) : 0;
  return { commitment, delivered, pct };
}
