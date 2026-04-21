import {
  runMonteCarloSimulation,
  computeCardRiskScore,
  type CardRiskScore,
  type MonteCarloResult,
} from "@/lib/predictive-delivery";

const DAY_MS = 24 * 60 * 60 * 1000;

export type VelocityScenario = {
  removeCards: number;
  capacityMultiplier: number;
};

export type CompletionProbability = {
  pctChance: number;
  label: "impossible" | "unlikely" | "possible" | "likely" | "almost_certain";
};

export type OracleResult = {
  totalCards: number;
  doneCards: number;
  remainingCards: number;
  dailyThroughputAvg: number;
  monteCarlo: MonteCarloResult | null;
  riskCards: CardRiskScore[];
  completionBySprintEnd: CompletionProbability | null;
  sprintEndDate: string | null;
  daysLeft: number | null;
  scenario: VelocityScenario;
  scenarioDelta: { pctChange: number; daysChange: number } | null;
  generatedAt: string;
};

type CardLike = {
  id: string;
  title: string;
  bucket: string;
  progress: string;
  priority?: string;
  columnEnteredAt?: string;
  blockedBy?: string[];
};

function computeDailyHistory(cards: CardLike[], now: number): number[] {
  const completedByDay = new Map<string, number>();
  for (const card of cards) {
    if (card.progress !== "Concluída") continue;
    const ts = (card as Record<string, unknown>).completedAt ?? card.columnEnteredAt;
    if (!ts || typeof ts !== "string") continue;
    const key = ts.slice(0, 10);
    completedByDay.set(key, (completedByDay.get(key) ?? 0) + 1);
  }
  const days: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    days.push(completedByDay.get(d.toISOString().slice(0, 10)) ?? 0);
  }
  return days;
}

function simCompletionChance(
  monteCarlo: MonteCarloResult | null,
  daysLeft: number
): CompletionProbability | null {
  if (!monteCarlo || daysLeft == null) return null;
  const { p50Days, p85Days } = monteCarlo;
  let pctChance: number;
  if (daysLeft <= 0) pctChance = 0;
  else if (daysLeft >= p85Days * 1.5) pctChance = 95;
  else if (daysLeft >= p85Days) pctChance = 85;
  else if (daysLeft >= p50Days) pctChance = 50;
  else if (daysLeft >= p50Days * 0.7) pctChance = 30;
  else pctChance = 10;

  const label: CompletionProbability["label"] =
    pctChance >= 85
      ? "almost_certain"
      : pctChance >= 65
      ? "likely"
      : pctChance >= 40
      ? "possible"
      : pctChance >= 20
      ? "unlikely"
      : "impossible";

  return { pctChance, label };
}

export function computeVelocityOracle(
  cards: CardLike[],
  sprintEndDate: string | null,
  scenario: VelocityScenario = { removeCards: 0, capacityMultiplier: 1 }
): OracleResult {
  const now = Date.now();

  const totalCards = cards.length;
  const doneCards = cards.filter((c) => c.progress === "Concluída").length;
  const rawRemaining = totalCards - doneCards;
  const remaining = Math.max(0, rawRemaining - scenario.removeCards);

  const dailyHistory = computeDailyHistory(cards, now).map(
    (v) => v * (scenario.capacityMultiplier ?? 1)
  );
  const dailyAvg =
    dailyHistory.length > 0
      ? dailyHistory.reduce((a, b) => a + b, 0) / dailyHistory.filter((v) => v > 0).length || 0
      : 0;

  const monteCarlo = runMonteCarloSimulation(remaining, dailyHistory);

  const riskCards = cards
    .filter((c) => c.progress !== "Concluída")
    .map((c) => computeCardRiskScore(c as Parameters<typeof computeCardRiskScore>[0]))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  let daysLeft: number | null = null;
  if (sprintEndDate) {
    daysLeft = Math.max(0, (new Date(sprintEndDate).getTime() - now) / DAY_MS);
  }

  const completionBySprintEnd = simCompletionChance(monteCarlo, daysLeft ?? -1);

  // Compute baseline for scenario delta
  const baselineMonteCarlo = runMonteCarloSimulation(rawRemaining, dailyHistory);
  let scenarioDelta: OracleResult["scenarioDelta"] = null;
  if (
    baselineMonteCarlo &&
    monteCarlo &&
    (scenario.removeCards > 0 || scenario.capacityMultiplier !== 1)
  ) {
    const baseChance = simCompletionChance(baselineMonteCarlo, daysLeft ?? -1);
    const scenChance = completionBySprintEnd;
    scenarioDelta = {
      pctChange: (scenChance?.pctChance ?? 0) - (baseChance?.pctChance ?? 0),
      daysChange: baselineMonteCarlo.p50Days - monteCarlo.p50Days,
    };
  }

  return {
    totalCards,
    doneCards,
    remainingCards: remaining,
    dailyThroughputAvg: Math.round(dailyAvg * 10) / 10,
    monteCarlo,
    riskCards,
    completionBySprintEnd,
    sprintEndDate,
    daysLeft: daysLeft !== null ? Math.round(daysLeft) : null,
    scenario,
    scenarioDelta,
    generatedAt: new Date().toISOString(),
  };
}
