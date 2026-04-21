"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiGet } from "@/lib/api-client";
import type { OracleResult } from "@/lib/velocity-oracle";

type Props = {
  boardId: string;
  sprintId: string;
  getHeaders: () => Record<string, string>;
};

const PROB_COLOR = (pct: number) =>
  pct >= 85
    ? "var(--flux-success)"
    : pct >= 60
    ? "var(--flux-info)"
    : pct >= 35
    ? "var(--flux-warning)"
    : "var(--flux-danger)";

function ProbabilityGauge({ pct, label }: { pct: number; label: string }) {
  const angle = (pct / 100) * 180;
  const r = 56;
  const cx = 70;
  const cy = 70;

  function polarToCartesian(deg: number) {
    const rad = ((deg - 180) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const start = polarToCartesian(0);
  const end = polarToCartesian(angle);
  const largeArc = angle > 90 ? 1 : 0;
  const color = PROB_COLOR(pct);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="140" height="80" viewBox="0 0 140 80" className="overflow-visible">
        {/* Track */}
        <path
          d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
          fill="none"
          stroke="var(--flux-chrome-alpha-12)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Fill */}
        {pct > 0 && (
          <path
            d={`M ${cx - r},${cy} A ${r},${r} 0 ${largeArc} 1 ${end.x},${end.y}`}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            style={{ transition: "d 0.7s cubic-bezier(.4,0,.2,1)" }}
          />
        )}
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={end.x}
          y2={end.y}
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ transition: "x2 0.7s, y2 0.7s" }}
        />
        <circle cx={cx} cy={cy} r="5" fill={color} />
        {/* Labels */}
        <text x={cx - r - 4} y={cy + 16} fontSize="9" fill="var(--flux-text-muted)" textAnchor="end">0%</text>
        <text x={cx + r + 4} y={cy + 16} fontSize="9" fill="var(--flux-text-muted)" textAnchor="start">100%</text>
      </svg>
      <div className="text-center -mt-1">
        <p className="text-3xl font-black leading-none" style={{ color }}>
          {pct}%
        </p>
        <p className="mt-0.5 text-[11px] font-semibold" style={{ color }}>
          {label}
        </p>
      </div>
    </div>
  );
}

function TimelineBar({ days, label, color }: { days: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[56px] shrink-0 text-[10px] text-[var(--flux-text-muted)]">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, (days / 60) * 100)}%`,
            background: color,
            transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
          }}
        />
      </div>
      <span className="w-[44px] text-right text-[11px] font-semibold" style={{ color }}>
        {days}d
      </span>
    </div>
  );
}

export function VelocityOraclePanel({ boardId, sprintId, getHeaders }: Props) {
  const t = useTranslations("velocityOracle");
  const [result, setResult] = useState<OracleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removeCards, setRemoveCards] = useState(0);
  const [capacityMul, setCapacityMul] = useState(1);
  const [scenarioActive, setScenarioActive] = useState(false);

  const load = async (rc: number, cm: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (rc > 0) params.set("removeCards", String(rc));
      if (cm !== 1) params.set("capacityMultiplier", String(cm));
      const data = await apiGet<{ ok: boolean; result: OracleResult }>(
        `/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprintId)}/velocity-oracle${params.toString() ? "?" + params.toString() : ""}`,
        getHeaders()
      );
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(removeCards, capacityMul);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, sprintId]);

  const applyScenario = () => {
    setScenarioActive(true);
    void load(removeCards, capacityMul);
  };

  const resetScenario = () => {
    setRemoveCards(0);
    setCapacityMul(1);
    setScenarioActive(false);
    void load(0, 1);
  };

  const prob = result?.completionBySprintEnd;
  const mc = result?.monteCarlo;

  return (
    <div className="rounded-2xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] overflow-hidden">
      {/* Header */}
      <div
        className="px-5 pt-5 pb-4"
        style={{
          background: "linear-gradient(135deg, color-mix(in srgb, var(--flux-secondary) 10%, var(--flux-surface-card)) 0%, var(--flux-surface-card) 70%)",
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-secondary)]">
              {t("pretitle")}
            </p>
            <h3 className="font-display text-base font-bold text-[var(--flux-text)]">
              {t("title")}
            </h3>
          </div>
          {result?.daysLeft !== null && result?.daysLeft !== undefined && (
            <div className="text-right">
              <p className="text-[10px] text-[var(--flux-text-muted)]">{t("daysLeft")}</p>
              <p className="text-xl font-black text-[var(--flux-text)]">{result.daysLeft}</p>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-5 space-y-5">
        {loading && (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-[var(--flux-secondary)] border-t-transparent animate-spin" />
          </div>
        )}
        {error && <p className="text-sm text-[var(--flux-danger)]">{error}</p>}

        {!loading && result && (
          <>
            {/* Probability Gauge */}
            {prob ? (
              <div className="flex justify-center pt-2">
                <ProbabilityGauge pct={prob.pctChance} label={t(`prob.${prob.label}`)} />
              </div>
            ) : (
              <p className="text-center text-sm text-[var(--flux-text-muted)]">{t("noData")}</p>
            )}

            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: t("metrics.total"), value: result.totalCards },
                { label: t("metrics.done"), value: result.doneCards },
                { label: t("metrics.remaining"), value: result.remainingCards },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] p-2.5 text-center">
                  <p className="text-[10px] text-[var(--flux-text-muted)]">{label}</p>
                  <p className="text-xl font-black text-[var(--flux-text)]">{value}</p>
                </div>
              ))}
            </div>

            {/* Monte Carlo timeline */}
            {mc && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
                  {t("forecastTitle")}
                </p>
                <TimelineBar days={mc.p50Days} label="P50" color="var(--flux-success)" />
                <TimelineBar days={mc.p85Days} label="P85" color="var(--flux-warning)" />
                <TimelineBar days={mc.p95Days} label="P95" color="var(--flux-danger)" />
              </div>
            )}

            {/* Risk cards */}
            {result.riskCards.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
                  {t("riskTitle")}
                </p>
                {result.riskCards.slice(0, 3).map((rc) => (
                  <div key={rc.cardId} className="flex items-center gap-2 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] px-3 py-1.5">
                    <div
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: rc.score >= 70 ? "var(--flux-danger)" : rc.score >= 40 ? "var(--flux-warning)" : "var(--flux-info)" }}
                    />
                    <span className="flex-1 truncate text-[11px] text-[var(--flux-text)]">{rc.cardId}</span>
                    <span className="text-[10px] font-bold text-[var(--flux-text-muted)]">{rc.score}</span>
                  </div>
                ))}
              </div>
            )}

            {/* What-if scenario */}
            <div className="rounded-xl border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-primary-alpha-06)] p-4 space-y-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--flux-primary-light)]">
                ✦ {t("scenarioTitle")}
              </p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[10px] text-[var(--flux-text-muted)] mb-1">
                    <span>{t("removeCards")}</span>
                    <span className="font-bold text-[var(--flux-text)]">{removeCards}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, result.remainingCards)}
                    value={removeCards}
                    onChange={(e) => setRemoveCards(Number(e.target.value))}
                    className="w-full accent-[var(--flux-primary)]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-[var(--flux-text-muted)] mb-1">
                    <span>{t("capacity")}</span>
                    <span className="font-bold text-[var(--flux-text)]">{Math.round(capacityMul * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={capacityMul}
                    onChange={(e) => setCapacityMul(Number(e.target.value))}
                    className="w-full accent-[var(--flux-primary)]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={applyScenario}
                  className="flex-1 rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
                >
                  {t("applyScenario")}
                </button>
                {scenarioActive && (
                  <button
                    type="button"
                    onClick={resetScenario}
                    className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] px-3 py-1.5 text-[11px] text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
                  >
                    {t("reset")}
                  </button>
                )}
              </div>
              {result.scenarioDelta && (
                <p className="text-[11px] text-[var(--flux-text-secondary)]">
                  {result.scenarioDelta.pctChange >= 0 ? "↑" : "↓"}{" "}
                  <span className="font-semibold" style={{ color: result.scenarioDelta.pctChange >= 0 ? "var(--flux-success)" : "var(--flux-danger)" }}>
                    {Math.abs(result.scenarioDelta.pctChange)}% probabilidade
                  </span>
                  {result.scenarioDelta.daysChange !== 0 && (
                    <>, {Math.abs(result.scenarioDelta.daysChange)} dias {result.scenarioDelta.daysChange > 0 ? "mais cedo" : "mais tarde"}</>
                  )}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
