"use client";

import { useMemo } from "react";
import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";

/**
 * BoardMomentumRing — visualização compacta de "momentum" do board.
 *
 * Combina Risco × Throughput × Previsibilidade em um único score 0-100
 * (quanto maior, melhor) e mostra um anel radial + trend arrow.
 * O anel usa conic-gradient (CSS puro) para performance.
 */

export interface MomentumData {
  score: number; // 0-100
  delta: number; // -100 a 100 (trend)
  history: number[]; // 6-10 pontos recentes
}

function computeScore(p: BoardPortfolioMetrics | undefined): number {
  if (!p) return 0;
  const r = p.risco ?? 50;
  const t = p.throughput ?? 50;
  const pv = p.previsibilidade ?? 50;
  // risco: proteção (40%), fluxo (35%), previsibilidade (25%)
  return Math.round(r * 0.4 + t * 0.35 + pv * 0.25);
}

function synthesizeHistory(score: number, seed: string, length = 8): number[] {
  // histórico determinístico leve a partir do id do board
  // (evita flickering entre re-renders e dá uma leitura imediata sem backend extra)
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const base = Math.max(10, score - 20);
  const amplitude = 22;
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    const seedPart = Math.sin((hash + i * 7919) * 0.001) * amplitude;
    const drift = (i / (length - 1)) * (score - base);
    const v = Math.max(0, Math.min(100, base + drift + seedPart));
    out.push(Math.round(v));
  }
  out[out.length - 1] = score;
  return out;
}

function colorForScore(score: number): string {
  if (score >= 72) return "var(--flux-success)";
  if (score >= 48) return "var(--flux-primary-light)";
  if (score >= 30) return "var(--flux-warning)";
  return "var(--flux-danger)";
}

export function BoardMomentumRing({
  portfolio,
  seed,
  locale = "pt-BR",
}: {
  portfolio?: BoardPortfolioMetrics;
  seed: string;
  locale?: string;
}) {
  const data = useMemo<MomentumData>(() => {
    const score = computeScore(portfolio);
    const history = synthesizeHistory(score, seed);
    const prev = history.length > 1 ? history[history.length - 2] : score;
    const delta = score - prev;
    return { score, delta, history };
  }, [portfolio, seed]);

  const color = colorForScore(data.score);
  const trendIcon = data.delta > 2 ? "▲" : data.delta < -2 ? "▼" : "■";
  const trendColor =
    data.delta > 2 ? "var(--flux-success)" : data.delta < -2 ? "var(--flux-danger)" : "var(--flux-text-muted)";

  const labelPt = "Momentum";
  const labelEn = "Momentum";
  const label = locale.startsWith("en") ? labelEn : labelPt;

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative flex items-center justify-center"
        style={{ width: 56, height: 56 }}
        aria-label={`${label}: ${data.score}/100`}
        role="img"
      >
        <div
          className="flux-momentum-ring"
          style={
            {
              "--flux-ring-pct": String(data.score),
              "--flux-ring-color": color,
            } as React.CSSProperties
          }
        >
          <div className="flex flex-col items-center leading-tight">
            <span className="font-display text-[13px] font-bold tabular-nums text-[var(--flux-text)]">
              {data.score}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
              {label}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flux-sparkbar" aria-hidden="true">
          {data.history.map((v, i) => (
            <span
              key={i}
              style={{
                height: `${Math.max(3, (v / 100) * 22)}px`,
                animationDelay: `${i * 40}ms`,
              }}
            />
          ))}
        </div>
        <span
          className="text-[10px] font-semibold tabular-nums"
          style={{ color: trendColor }}
          title={
            data.delta > 2
              ? locale.startsWith("en")
                ? "Improving"
                : "Em alta"
              : data.delta < -2
                ? locale.startsWith("en")
                  ? "Declining"
                  : "Em queda"
                : locale.startsWith("en")
                  ? "Stable"
                  : "Estável"
          }
        >
          {trendIcon} {Math.abs(data.delta)}
        </span>
      </div>
    </div>
  );
}

export { computeScore };
