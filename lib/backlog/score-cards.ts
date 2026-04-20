/**
 * Auto-priorização determinística do backlog (spec §3) + tipos para justificativas IA.
 */

export type PrioritizationWeights = {
  weighDeadline: number;
  weighOkrImpact: number;
  weighDependencies: number;
  weighRisk: number;
  weighEffort: number;
};

export const DEFAULT_PRIORITIZATION_WEIGHTS: PrioritizationWeights = {
  weighDeadline: 0.25,
  weighOkrImpact: 0.2,
  weighDependencies: 0.2,
  weighRisk: 0.15,
  weighEffort: 0.2,
};

export type BacklogScoreCardInput = {
  id: string;
  title: string;
  dueDate: string | null;
  tags: string[];
  storyPoints: number | null | undefined;
  /** Quantos cards dependem deste (bloqueados por este). */
  blockingCount: number;
};

export type ScoredBacklogCard = BacklogScoreCardInput & {
  priorityScore: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function scoreBacklogCards(cards: BacklogScoreCardInput[], config: PrioritizationWeights): ScoredBacklogCard[] {
  const w = { ...DEFAULT_PRIORITIZATION_WEIGHTS, ...config };
  const sumW = w.weighDeadline + w.weighOkrImpact + w.weighDependencies + w.weighRisk + w.weighEffort || 1;

  const scored = cards.map((card) => {
    const deadlineScore = card.dueDate
      ? clamp01(
          1 -
            (new Date(`${String(card.dueDate).trim()}T12:00:00`).getTime() - Date.now()) / (30 * DAY_MS)
        )
      : 0;

    const tagLower = card.tags.map((t) => t.toLowerCase());
    const okrScore = tagLower.some((t) => t.includes("okr")) ? 1 : 0;

    const dependencyScore = card.blockingCount > 0 ? Math.min(card.blockingCount / 5, 1) : 0;

    const riskScore = tagLower.some((t) => t.includes("risk") || t.includes("risco")) ? 0.8 : 0.2;

    const sp = typeof card.storyPoints === "number" && Number.isFinite(card.storyPoints) ? card.storyPoints : null;
    const effortScore = sp != null ? 1 - clamp01(sp / 13) : 0.5;

    const raw =
      deadlineScore * w.weighDeadline +
      okrScore * w.weighOkrImpact +
      dependencyScore * w.weighDependencies +
      riskScore * w.weighRisk +
      effortScore * w.weighEffort;

    const priorityScore = sumW > 0 ? raw / sumW : 0;

    return { ...card, priorityScore };
  });

  return scored.sort((a, b) => b.priorityScore - a.priorityScore);
}
