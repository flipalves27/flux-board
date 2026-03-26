const DAY_MS = 24 * 60 * 60 * 1000;

export type MonteCarloResult = {
  p50Days: number;
  p85Days: number;
  p95Days: number;
  simulations: number;
};

export type CardRiskScore = {
  cardId: string;
  score: number;
  factors: string[];
};

export type ThroughputForecast = {
  weekLabel: string;
  predicted: number;
  lower: number;
  upper: number;
}[];

export type DeliveryForecastResult = {
  monteCarlo: MonteCarloResult | null;
  riskCards: CardRiskScore[];
  throughputForecast: ThroughputForecast;
  scopeCreepRatio: number;
  sprintHealthLabel: "healthy" | "at_risk" | "critical";
};

function sampleFromHistory(dailyThroughput: number[], count: number): number[] {
  const samples: number[] = [];
  for (let i = 0; i < count; i++) {
    samples.push(dailyThroughput[Math.floor(Math.random() * dailyThroughput.length)] ?? 0);
  }
  return samples;
}

export function runMonteCarloSimulation(
  remainingItems: number,
  dailyThroughputHistory: number[],
  numSimulations = 1000,
  maxDays = 120
): MonteCarloResult | null {
  if (remainingItems <= 0 || dailyThroughputHistory.length < 5) return null;
  const filtered = dailyThroughputHistory.filter((t) => t >= 0);
  if (filtered.length < 3) return null;

  const completionDays: number[] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    let done = 0;
    let days = 0;
    while (done < remainingItems && days < maxDays) {
      const dailySamples = sampleFromHistory(filtered, 1);
      done += dailySamples[0] ?? 0;
      days++;
    }
    completionDays.push(days);
  }

  completionDays.sort((a, b) => a - b);
  const percentile = (p: number) => completionDays[Math.floor(completionDays.length * p)] ?? maxDays;

  return {
    p50Days: percentile(0.5),
    p85Days: percentile(0.85),
    p95Days: percentile(0.95),
    simulations: numSimulations,
  };
}

export function computeCardRiskScore(card: {
  id: string;
  title: string;
  createdAt?: string | number | null;
  lastActivityAt?: string | number | null;
  blockedBy?: string[];
  dependencyCount?: number;
  progress?: string;
  dueDate?: string | null;
}): CardRiskScore {
  const factors: string[] = [];
  let score = 0;

  const now = Date.now();
  if (card.createdAt) {
    const ageDays = (now - new Date(card.createdAt).getTime()) / DAY_MS;
    if (ageDays > 14) { score += 20; factors.push("age_over_14d"); }
    if (ageDays > 30) { score += 15; factors.push("age_over_30d"); }
  }

  if (card.lastActivityAt) {
    const inactiveDays = (now - new Date(card.lastActivityAt).getTime()) / DAY_MS;
    if (inactiveDays > 5) { score += 20; factors.push("inactive_5d"); }
    if (inactiveDays > 10) { score += 15; factors.push("inactive_10d"); }
  } else {
    score += 10;
    factors.push("no_activity");
  }

  const blockedCount = card.blockedBy?.length ?? 0;
  if (blockedCount > 0) { score += 15 * Math.min(blockedCount, 3); factors.push("blocked"); }

  if ((card.dependencyCount ?? 0) > 2) { score += 10; factors.push("high_deps"); }

  if (card.dueDate) {
    const dueMs = new Date(card.dueDate).getTime();
    const daysUntilDue = (dueMs - now) / DAY_MS;
    if (daysUntilDue < 0) { score += 25; factors.push("overdue"); }
    else if (daysUntilDue < 3) { score += 15; factors.push("due_soon"); }
  }

  return { cardId: card.id, score: Math.min(100, score), factors };
}

export function computeThroughputForecast(
  weeklyThroughput: number[],
  weeksAhead = 4
): ThroughputForecast {
  if (weeklyThroughput.length < 2) {
    return Array.from({ length: weeksAhead }, (_, i) => ({
      weekLabel: `Semana +${i + 1}`,
      predicted: 0,
      lower: 0,
      upper: 0,
    }));
  }

  const n = weeklyThroughput.length;
  const mean = weeklyThroughput.reduce((a, b) => a + b, 0) / n;
  const variance = weeklyThroughput.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  const trend = n >= 3
    ? (weeklyThroughput[n - 1]! - weeklyThroughput[0]!) / (n - 1)
    : 0;

  const forecast: ThroughputForecast = [];
  for (let i = 1; i <= weeksAhead; i++) {
    const predicted = Math.max(0, Math.round(mean + trend * i));
    const lower = Math.max(0, Math.round(predicted - 1.5 * stddev));
    const upper = Math.round(predicted + 1.5 * stddev);
    forecast.push({ weekLabel: `Semana +${i}`, predicted, lower, upper });
  }

  return forecast;
}

export function computeScopeCreepRatio(
  plannedItems: number,
  addedMidSprint: number
): number {
  if (plannedItems <= 0) return 0;
  return Math.round((addedMidSprint / plannedItems) * 100) / 100;
}

export function deriveSprintHealth(
  scopeCreepRatio: number,
  avgRiskScore: number,
  monteCarlo: MonteCarloResult | null,
  sprintDaysRemaining: number
): "healthy" | "at_risk" | "critical" {
  let issues = 0;
  if (scopeCreepRatio > 0.3) issues++;
  if (avgRiskScore > 40) issues++;
  if (monteCarlo && monteCarlo.p85Days > sprintDaysRemaining * 1.5) issues++;

  if (issues >= 2) return "critical";
  if (issues >= 1) return "at_risk";
  return "healthy";
}
