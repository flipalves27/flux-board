/**
 * Health score executivo (0–100) a partir de throughput, risco médio, WIP, previsibilidade e OKRs.
 */

export type PortfolioHealthBreakdown = {
  throughput: number;
  risco: number;
  wipCompliance: number;
  previsibilidade: number;
  okrProgress: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function coalesce(v: number | null | undefined, fallback: number): number {
  return v != null && Number.isFinite(v) ? v : fallback;
}

export function computePortfolioHealthScore(input: {
  avgThroughput: number | null;
  avgRisco: number | null;
  avgPrevisibilidade: number | null;
  avgWipCompliance: number | null;
  okrAvgPct: number | null;
  okrAvailable: boolean;
}): { score: number; breakdown: PortfolioHealthBreakdown } {
  const throughput = coalesce(input.avgThroughput, 55);
  const risco = coalesce(input.avgRisco, 60);
  const previsibilidade = coalesce(input.avgPrevisibilidade, 55);
  const wipCompliance = coalesce(input.avgWipCompliance, 65);

  let okrProgress: number;
  if (input.okrAvailable && input.okrAvgPct != null && Number.isFinite(input.okrAvgPct)) {
    okrProgress = clamp(Math.round(input.okrAvgPct), 0, 100);
  } else {
    okrProgress = Math.round((throughput + risco + previsibilidade + wipCompliance) / 4);
  }

  const score = clamp(
    Math.round(
      0.22 * throughput +
        0.2 * risco +
        0.2 * wipCompliance +
        0.2 * previsibilidade +
        0.18 * okrProgress
    ),
    0,
    100
  );

  return {
    score,
    breakdown: {
      throughput: clamp(Math.round(throughput), 0, 100),
      risco: clamp(Math.round(risco), 0, 100),
      wipCompliance: clamp(Math.round(wipCompliance), 0, 100),
      previsibilidade: clamp(Math.round(previsibilidade), 0, 100),
      okrProgress: clamp(Math.round(okrProgress), 0, 100),
    },
  };
}
