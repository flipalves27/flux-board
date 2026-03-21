"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslations } from "next-intl";
import type { SprintPredictionPayload } from "@/lib/sprint-prediction-metrics";
import { ChartShell } from "@/components/reports/chart-shell";

const BAR_COLORS = {
  p50: "var(--flux-secondary)",
  p70: "var(--flux-primary-light)",
  p85: "var(--flux-warning-foreground)",
  p95: "var(--flux-danger)",
};

type Row = {
  weekLabel: string;
  p50: number;
  p70: number;
  p85: number;
  p95: number;
  isForecast?: boolean;
};

export function SprintPredictionPanel({ prediction }: { prediction: SprintPredictionPayload }) {
  const t = useTranslations("reports.sprint");

  const chartData = useMemo((): Row[] => {
    const hist = prediction.historicalPercentileBars.map((h) => ({
      weekLabel: h.weekLabel,
      p50: h.p50,
      p70: h.p70,
      p85: h.p85,
      p95: h.p95,
      isForecast: false,
    }));
    const next: Row = {
      weekLabel: t("forecastColumn"),
      p50: prediction.chartRow.p50,
      p70: prediction.chartRow.p70,
      p85: prediction.chartRow.p85,
      p95: prediction.chartRow.p95,
      isForecast: true,
    };
    return [...hist, next];
  }, [prediction, t]);

  if (!prediction.available) {
    return (
      <section className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-4 sm:p-5">
        <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("title")}</h3>
        <p className="mt-2 text-sm text-[var(--flux-text-muted)]">{prediction.reason ?? t("unavailable")}</p>
      </section>
    );
  }

  const explainPayload = {
    summary: prediction.summaryLine,
    rationale: prediction.rationale,
    percentiles: prediction.percentiles,
    method: prediction.method,
    backtest: prediction.backtest,
  };

  return (
    <ChartShell title={t("title")} hint={t("hint")} chartId="sprintPrediction" explainPayload={explainPayload}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-[var(--flux-text)]">{prediction.summaryLine}</p>
        <p className="text-xs leading-relaxed text-[var(--flux-text-muted)]">{prediction.rationale}</p>

        {prediction.backtest ? (
          <p className="text-xs text-[var(--flux-text-muted)]">
            {t("backtest", {
              accuracy: Math.round(prediction.backtest.accuracy * 100),
              pass: prediction.backtest.passes ? t("backtestPass") : t("backtestFail"),
            })}
          </p>
        ) : null}

        <div className="h-[300px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
              <XAxis
                dataKey="weekLabel"
                tick={{ fill: "var(--flux-text-muted)", fontSize: 10 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={52}
              />
              <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div
                      className="max-w-[280px] rounded-lg border border-[var(--flux-primary-alpha-25)] px-3 py-2 text-xs shadow-md"
                      style={{
                        background: "var(--flux-surface-card)",
                        color: "var(--flux-text)",
                      }}
                    >
                      <p className="font-semibold">{label}</p>
                      <ul className="mt-1 space-y-0.5">
                        {payload.map((p) => (
                          <li key={String(p.dataKey)} className="flex justify-between gap-3">
                            <span style={{ color: p.color }}>{p.name}</span>
                            <span className="font-mono">{p.value}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 border-t border-[var(--flux-chrome-alpha-08)] pt-2 text-[10px] leading-snug text-[var(--flux-text-muted)]">
                        {t("tooltipExplain")}
                      </p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="p50" name={t("p50")} fill={BAR_COLORS.p50} radius={[2, 2, 0, 0]} />
              <Bar dataKey="p70" name={t("p70")} fill={BAR_COLORS.p70} radius={[2, 2, 0, 0]} />
              <Bar dataKey="p85" name={t("p85")} fill={BAR_COLORS.p85} radius={[2, 2, 0, 0]} />
              <Bar dataKey="p95" name={t("p95")} fill={BAR_COLORS.p95} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("recommended")}</h4>
          <ul className="mt-2 space-y-2">
            {prediction.recommended.map((c) => (
              <li
                key={`${c.boardId}-${c.cardId}`}
                className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-08)] px-3 py-2 text-sm"
              >
                <span className="font-medium text-[var(--flux-text)]">{c.title}</span>
                <span className="mt-0.5 block text-[11px] text-[var(--flux-text-muted)]">
                  {c.boardName} · {c.priority} · ~{c.expectedCycleDays.toFixed(1)}d {t("cycleHint")}
                </span>
              </li>
            ))}
          </ul>
          {prediction.recommended.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--flux-text-muted)]">{t("noOpenCards")}</p>
          ) : null}
        </div>
      </div>
    </ChartShell>
  );
}
