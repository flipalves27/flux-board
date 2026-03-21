import type { BoardData } from "@/lib/kv-boards";
import type { FluxWeekRange, WeeklyThroughputPoint } from "@/lib/flux-reports-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SIM_RUNS = 1000;
const MIN_WEEKS_FOR_PREDICTION = 4;
const BACKTEST_WINDOWS = 4;

/** Deterministic PRNG for reproducible tests (mulberry32). */
export function createSeededRandom(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function monteCarloThroughputPercentiles(
  weeklyHistory: number[],
  runs: number,
  rand: () => number = Math.random
): { p50: number; p70: number; p85: number; p95: number; p10: number; p90: number } {
  if (!weeklyHistory.length || runs < 1) {
    return { p50: 0, p70: 0, p85: 0, p95: 0, p10: 0, p90: 0 };
  }
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const pick = weeklyHistory[Math.floor(rand() * weeklyHistory.length)] ?? 0;
    samples.push(pick);
  }
  samples.sort((a, b) => a - b);
  return {
    p10: percentileSorted(samples, 10),
    p50: percentileSorted(samples, 50),
    p70: percentileSorted(samples, 70),
    p85: percentileSorted(samples, 85),
    p90: percentileSorted(samples, 90),
    p95: percentileSorted(samples, 95),
  };
}

/**
 * Monte Carlo: soma de `n` cycle times amostrados (com reposição) até ultrapassar `horizonDays`.
 * Retorna quantos itens "completam" dentro do horizonte (modelo de fluxo sequencial simplificado).
 */
export function monteCarloCompletionsFromCycleTimes(
  cycleDays: number[],
  horizonDays: number,
  runs: number,
  rand: () => number = Math.random
): { p50: number; p70: number; p85: number; p95: number; p10: number; p90: number } {
  const filtered = cycleDays.filter((d) => Number.isFinite(d) && d >= 0);
  if (!filtered.length || horizonDays <= 0 || runs < 1) {
    return { p50: 0, p70: 0, p85: 0, p95: 0, p10: 0, p90: 0 };
  }
  const samples: number[] = [];
  for (let r = 0; r < runs; r++) {
    let time = 0;
    let count = 0;
    while (time < horizonDays) {
      const draw = filtered[Math.floor(rand() * filtered.length)] ?? 0;
      time += Math.max(0.25, draw);
      if (time <= horizonDays) count += 1;
      if (count > 10_000) break;
    }
    samples.push(count);
  }
  samples.sort((a, b) => a - b);
  return {
    p10: percentileSorted(samples, 10),
    p50: percentileSorted(samples, 50),
    p70: percentileSorted(samples, 70),
    p85: percentileSorted(samples, 85),
    p90: percentileSorted(samples, 90),
    p95: percentileSorted(samples, 95),
  };
}

export type BacktestResult = {
  windows: number;
  hitsAtOrBelowP85: number;
  accuracy: number;
  passes: boolean;
};

/** Para cada uma das últimas `BACKTEST_WINDOWS` semanas, treina com as 4 semanas anteriores e verifica se o real ≤ P85. */
export function backtestWeeklyThroughputP85(
  weeklyConcluded: number[],
  runs: number,
  rand: () => number = Math.random
): BacktestResult {
  const n = weeklyConcluded.length;
  if (n < MIN_WEEKS_FOR_PREDICTION + BACKTEST_WINDOWS) {
    return { windows: 0, hitsAtOrBelowP85: 0, accuracy: 0, passes: false };
  }
  let hits = 0;
  let windows = 0;
  for (let k = n - BACKTEST_WINDOWS; k < n; k++) {
    const train = weeklyConcluded.slice(k - MIN_WEEKS_FOR_PREDICTION, k);
    if (train.length < MIN_WEEKS_FOR_PREDICTION) continue;
    const { p85 } = monteCarloThroughputPercentiles(train, runs, rand);
    const actual = weeklyConcluded[k] ?? 0;
    windows += 1;
    if (actual <= Math.ceil(p85)) hits += 1;
  }
  const accuracy = windows > 0 ? hits / windows : 0;
  return { windows, hitsAtOrBelowP85: hits, accuracy, passes: accuracy >= 0.7 };
}

function priorityWeight(p: string): number {
  const s = p.trim().toLowerCase();
  if (s.includes("urgent") || s === "urgente") return 4;
  if (s.includes("importante") || s.includes("important")) return 3;
  if (s.includes("méd") || s.includes("med") || s.includes("media")) return 2;
  return 1;
}

function dueUrgency(dueDate: string | null | undefined, nowMs: number): number {
  if (!dueDate || typeof dueDate !== "string" || !dueDate.trim()) return 2;
  const due = new Date(`${dueDate.trim()}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 2;
  const days = Math.ceil((due.getTime() - nowMs) / DAY_MS);
  if (days <= 3) return 4;
  if (days <= 7) return 3;
  if (days <= 14) return 2;
  return 1;
}

export type SprintCardSuggestion = {
  cardId: string;
  boardId: string;
  boardName: string;
  title: string;
  priority: string;
  bucket: string;
  dueDate: string | null;
  score: number;
  expectedCycleDays: number;
};

export function rankCardsForSprint(
  boards: BoardData[],
  medianCycleDays: number,
  limit: number,
  nowMs: number = Date.now()
): SprintCardSuggestion[] {
  const cycle = medianCycleDays > 0 ? medianCycleDays : 7;
  const out: SprintCardSuggestion[] = [];

  for (const board of boards) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const card of cards) {
      if (!card || typeof card !== "object") continue;
      const rec = card as Record<string, unknown>;
      if (String(rec.progress || "") === "Concluída") continue;
      const id = String(rec.id || "");
      if (!id) continue;
      const title = String(rec.title || "—");
      const priority = String(rec.priority || "—");
      const bucket = String(rec.bucket || "—");
      const dueDate = typeof rec.dueDate === "string" ? rec.dueDate : null;
      const pw = priorityWeight(priority);
      const uw = dueUrgency(dueDate, nowMs);
      const inv = 1 / cycle;
      const score = pw * uw * inv;
      out.push({
        cardId: id,
        boardId: board.id,
        boardName: board.name || board.id,
        title,
        priority,
        bucket,
        dueDate,
        score,
        expectedCycleDays: cycle,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export type SprintPredictionPayload = {
  available: boolean;
  reason?: string;
  horizonDays: number;
  simulations: number;
  minWeeksRequired: number;
  weeksOfHistory: number;
  hasCopilotThroughput: boolean;
  cycleSamples: number;
  method: "bootstrap_weekly_throughput" | "cycle_time_sequential_monte_carlo";
  percentiles: {
    p10: number;
    p50: number;
    p70: number;
    p85: number;
    p90: number;
    p95: number;
  };
  interval85: { low: number; high: number };
  summaryLine: string;
  rationale: string;
  recommended: SprintCardSuggestion[];
  backtest: BacktestResult | null;
  chartRow: {
    weekLabel: string;
    p50: number;
    p70: number;
    p85: number;
    p95: number;
    isForecast?: boolean;
  };
  /** Uma linha por semana histórica (últimas 8): percentis bootstrap usando as outras 7 semanas como pool. */
  historicalPercentileBars: Array<{
    weekLabel: string;
    p50: number;
    p70: number;
    p85: number;
    p95: number;
  }>;
};

function buildRationale(
  method: SprintPredictionPayload["method"],
  p85: number,
  recommended: SprintCardSuggestion[],
  medianCycle: number
): string {
  const top = recommended.slice(0, 3).map((c) => `"${c.title}" (${c.priority})`);
  const methodPt =
    method === "bootstrap_weekly_throughput"
      ? "Throughput semanal histórico (Copilot) com bootstrap."
      : "Tempos de ciclo observados (coluna → conclusão) com simulação sequencial.";
  const tail =
    top.length > 0
      ? ` Priorização sugerida (prioridade × urgência do prazo × 1/tempo de ciclo esperado ~${medianCycle.toFixed(1)}d): ${top.join(", ")}.`
      : "";
  return `${methodPt} P85 ≈ ${Math.ceil(p85)} conclusões no horizonte.${tail}`;
}

function medianCycleDaysFromBoards(boards: BoardData[]): number {
  const vals: number[] = [];
  for (const board of boards) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const card of cards) {
      if (!card || typeof card !== "object") continue;
      const rec = card as Record<string, unknown>;
      if (String(rec.progress || "") !== "Concluída") continue;
      const d = rec.completedCycleDays;
      if (typeof d === "number" && Number.isFinite(d) && d >= 0) vals.push(d);
    }
  }
  if (!vals.length) return 7;
  vals.sort((a, b) => a - b);
  return percentileSorted(vals, 50);
}

function emptyUnavailable(base: Partial<SprintPredictionPayload>): SprintPredictionPayload {
  return {
    available: false,
    reason: base.reason,
    horizonDays: base.horizonDays ?? 7,
    simulations: base.simulations ?? DEFAULT_SIM_RUNS,
    minWeeksRequired: MIN_WEEKS_FOR_PREDICTION,
    weeksOfHistory: base.weeksOfHistory ?? 0,
    hasCopilotThroughput: false,
    cycleSamples: base.cycleSamples ?? 0,
    method: "bootstrap_weekly_throughput",
    percentiles: { p10: 0, p50: 0, p70: 0, p85: 0, p90: 0, p95: 0 },
    interval85: { low: 0, high: 0 },
    summaryLine: "",
    rationale: "",
    recommended: [],
    backtest: null,
    chartRow: { weekLabel: "", p50: 0, p70: 0, p85: 0, p95: 0 },
    historicalPercentileBars: [],
  };
}

export function buildSprintPredictionPayload(args: {
  boards: BoardData[];
  weeks: FluxWeekRange[];
  weeklyThroughput: WeeklyThroughputPoint[];
  nowMs?: number;
  runs?: number;
  horizonDays?: number;
}): SprintPredictionPayload {
  const nowMs = args.nowMs ?? Date.now();
  const runs = args.runs ?? DEFAULT_SIM_RUNS;
  const horizonDays = args.horizonDays ?? 7;
  const weeks = args.weeks;
  const weeklyConcluded = args.weeklyThroughput.map((w) => w.concluded);
  const weeksOfHistory = weeks.length;

  if (weeksOfHistory < MIN_WEEKS_FOR_PREDICTION) {
    return emptyUnavailable({
      reason: "Dados insuficientes: são necessárias pelo menos 4 semanas de histórico.",
      horizonDays,
      simulations: runs,
      weeksOfHistory,
    });
  }

  const hasThroughput = weeklyConcluded.some((n) => n > 0);
  const cycleDays: number[] = [];
  for (const board of args.boards) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const card of cards) {
      if (!card || typeof card !== "object") continue;
      const rec = card as Record<string, unknown>;
      if (String(rec.progress || "") !== "Concluída") continue;
      const d = rec.completedCycleDays;
      if (typeof d === "number" && Number.isFinite(d) && d >= 0) cycleDays.push(d);
    }
  }

  const canBootstrap = hasThroughput && weeklyConcluded.length >= MIN_WEEKS_FOR_PREDICTION;
  const canCycleMc = cycleDays.length >= 8;

  if (!canBootstrap && !canCycleMc) {
    return emptyUnavailable({
      reason:
        "Dados insuficientes: é preciso throughput semanal (Copilot) nas últimas semanas ou pelo menos 8 conclusões com tempo de ciclo registrado.",
      horizonDays,
      simulations: runs,
      weeksOfHistory,
      cycleSamples: cycleDays.length,
    });
  }

  const medianCycle = medianCycleDaysFromBoards(args.boards);

  let percentiles: ReturnType<typeof monteCarloThroughputPercentiles>;
  let method: SprintPredictionPayload["method"] = "bootstrap_weekly_throughput";

  if (canBootstrap) {
    percentiles = monteCarloThroughputPercentiles(weeklyConcluded, runs);
    method = "bootstrap_weekly_throughput";
  } else {
    percentiles = monteCarloCompletionsFromCycleTimes(cycleDays, horizonDays, runs);
    method = "cycle_time_sequential_monte_carlo";
  }

  const low = clampInt(percentiles.p10, 0, 1_000_000);
  const high = clampInt(percentiles.p85, 0, 1_000_000);
  const summaryLine = `Com 85% de confiança (faixa entre percentis ~10 e ~85), o time tende a completar entre ${low} e ${high} cards no próximo período de ${horizonDays} dias.`;

  const recommended = rankCardsForSprint(args.boards, medianCycle, 8, nowMs);
  const rationale = buildRationale(method, percentiles.p85, recommended, medianCycle);

  let backtest: BacktestResult | null = null;
  if (weeklyConcluded.length >= MIN_WEEKS_FOR_PREDICTION + BACKTEST_WINDOWS && hasThroughput) {
    backtest = backtestWeeklyThroughputP85(weeklyConcluded, runs);
  }

  const chartRow = {
    weekLabel: "",
    p50: Math.round(percentiles.p50),
    p70: Math.round(percentiles.p70),
    p85: Math.round(percentiles.p85),
    p95: Math.round(percentiles.p95),
    isForecast: true as const,
  };

  const historicalPercentileBars: SprintPredictionPayload["historicalPercentileBars"] = [];
  if (hasThroughput && weeklyConcluded.length >= MIN_WEEKS_FOR_PREDICTION + 1) {
    for (let i = 0; i < weeklyConcluded.length; i++) {
      const pool: number[] = [];
      for (let j = 0; j < weeklyConcluded.length; j++) {
        if (j !== i) pool.push(weeklyConcluded[j] ?? 0);
      }
      if (pool.length < MIN_WEEKS_FOR_PREDICTION) continue;
      const hist = monteCarloThroughputPercentiles(pool, runs);
      historicalPercentileBars.push({
        weekLabel: args.weeks[i]?.label ?? `W${i + 1}`,
        p50: Math.round(hist.p50),
        p70: Math.round(hist.p70),
        p85: Math.round(hist.p85),
        p95: Math.round(hist.p95),
      });
    }
  }

  return {
    available: true,
    horizonDays,
    simulations: runs,
    minWeeksRequired: MIN_WEEKS_FOR_PREDICTION,
    weeksOfHistory,
    hasCopilotThroughput: hasThroughput,
    cycleSamples: cycleDays.length,
    method,
    percentiles: {
      p10: percentiles.p10,
      p50: percentiles.p50,
      p70: percentiles.p70,
      p85: percentiles.p85,
      p90: percentiles.p90,
      p95: percentiles.p95,
    },
    interval85: { low, high },
    summaryLine,
    rationale,
    recommended,
    backtest,
    chartRow,
    historicalPercentileBars,
  };
}
