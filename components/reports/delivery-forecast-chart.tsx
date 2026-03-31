"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { DataFadeIn } from "@/components/ui/data-fade-in";

type MonteCarloResult = {
  p50Days: number;
  p85Days: number;
  p95Days: number;
  simulations: number;
};

type CardRiskScore = {
  cardId: string;
  score: number;
  factors: string[];
};

type ThroughputPoint = {
  weekLabel: string;
  predicted: number;
  lower: number;
  upper: number;
};

type ForecastData = {
  ok: boolean;
  monteCarlo: MonteCarloResult | null;
  riskCards: CardRiskScore[];
  throughputForecast: ThroughputPoint[];
  scopeCreepRatio: number;
  sprintHealthLabel: "healthy" | "at_risk" | "critical";
};

type ScenarioInner = Omit<ForecastData, "ok">;

type ScenarioResponse = {
  ok: boolean;
  baseline: ScenarioInner;
  scenario: ScenarioInner;
  audit: {
    baseline: { incompleteCountBaseline: number; incompleteCountScenario: number; capacityMultiplier: number; removeItems: number };
    scenario: { incompleteCountBaseline: number; incompleteCountScenario: number; capacityMultiplier: number; removeItems: number };
    nlMatches: string[];
    narrative: string;
  };
  explanation: string;
};

const HEALTH_STYLES: Record<string, { bg: string; text: string }> = {
  healthy: { bg: "bg-[var(--flux-success)]/15", text: "text-[var(--flux-success)]" },
  at_risk: { bg: "bg-[var(--flux-warning)]/15", text: "text-[var(--flux-warning)]" },
  critical: { bg: "bg-[var(--flux-danger)]/15", text: "text-[var(--flux-danger)]" },
};

type Props = {
  boardId: string;
};

export function DeliveryForecastChart({ boardId }: Props) {
  const { getHeaders } = useAuth();
  const t = useTranslations("deliveryForecast");
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);

  const [removeItems, setRemoveItems] = useState(0);
  const [capacityMul, setCapacityMul] = useState(1);
  const [nl, setNl] = useState("");
  const [scenario, setScenario] = useState<ScenarioResponse | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioErr, setScenarioErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet<ForecastData>(`/api/boards/${boardId}/delivery-forecast`, getHeaders());
        setData(res);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [boardId, getHeaders]);

  const runScenario = useCallback(async () => {
    setScenarioLoading(true);
    setScenarioErr(null);
    try {
      const res = await apiPost<ScenarioResponse>(
        `/api/boards/${boardId}/delivery-forecast-scenario`,
        {
          removeItems,
          capacityMultiplier: capacityMul,
          ...(nl.trim() ? { message: nl.trim() } : {}),
        },
        getHeaders()
      );
      setScenario(res);
    } catch (e) {
      setScenario(null);
      setScenarioErr(e instanceof ApiError ? e.message : t("scenarioError"));
    } finally {
      setScenarioLoading(false);
    }
  }, [boardId, getHeaders, removeItems, capacityMul, nl, t]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl bg-[var(--flux-chrome-alpha-06)]" />
        <div className="h-32 animate-pulse rounded-2xl bg-[var(--flux-chrome-alpha-06)]" />
      </div>
    );
  }

  if (!data) return null;

  const health = HEALTH_STYLES[data.sprintHealthLabel] ?? HEALTH_STYLES.healthy!;

  const renderMonteBlock = (label: string, mc: MonteCarloResult | null) => (
    <div className="rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-dark)] p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase text-[var(--flux-text-muted)]">{label}</p>
      {mc ? (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[10px] text-[var(--flux-text-muted)]">{t("p50")}</p>
            <p className="font-display text-lg font-bold text-[var(--flux-success)]">
              {mc.p50Days} <span className="text-xs font-normal">{t("daysUnit")}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--flux-text-muted)]">{t("p85")}</p>
            <p className="font-display text-lg font-bold text-[var(--flux-warning)]">
              {mc.p85Days} <span className="text-xs font-normal">{t("daysUnit")}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--flux-text-muted)]">{t("p95")}</p>
            <p className="font-display text-lg font-bold text-[var(--flux-danger)]">
              {mc.p95Days} <span className="text-xs font-normal">{t("daysUnit")}</span>
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--flux-text-muted)]">—</p>
      )}
    </div>
  );

  return (
    <DataFadeIn active={!loading}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="font-display text-base font-bold text-[var(--flux-text)]">{t("title")}</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${health.bg} ${health.text}`}>
              {t(data.sprintHealthLabel)}
            </span>
          </div>

          {data.monteCarlo && (
            <div className="rounded-2xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-5">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">{t("monteCarlo")}</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-[var(--flux-text-muted)]">{t("p50")}</p>
                  <p className="font-display text-2xl font-bold text-[var(--flux-success)]">
                    {data.monteCarlo.p50Days} <span className="text-sm font-normal">{t("daysUnit")}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--flux-text-muted)]">{t("p85")}</p>
                  <p className="font-display text-2xl font-bold text-[var(--flux-warning)]">
                    {data.monteCarlo.p85Days} <span className="text-sm font-normal">{t("daysUnit")}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--flux-text-muted)]">{t("p95")}</p>
                  <p className="font-display text-2xl font-bold text-[var(--flux-danger)]">
                    {data.monteCarlo.p95Days} <span className="text-sm font-normal">{t("daysUnit")}</span>
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--flux-text-muted)]">{t("monteNarrative")}</p>
            </div>
          )}

          {data.throughputForecast.length > 0 && (
            <div className="rounded-2xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-5">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">{t("throughputForecast")}</h4>
              <div className="flex items-end gap-2">
                {data.throughputForecast.map((point) => (
                  <div key={point.weekLabel} className="flex-1 text-center">
                    <div className="relative mx-auto w-8">
                      <div
                        className="mx-auto rounded-t-md bg-[var(--flux-primary-alpha-25)]"
                        style={{ height: `${Math.max(8, (point.upper - point.lower) * 4)}px` }}
                      />
                      <div
                        className="mx-auto -mt-px rounded-md bg-[var(--flux-primary)]"
                        style={{ height: `${Math.max(4, point.predicted * 4)}px`, width: "20px" }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--flux-text-muted)]">{point.weekLabel}</p>
                    <p className="text-xs font-semibold text-[var(--flux-text)]">{point.predicted}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.riskCards.length > 0 && (
            <div className="rounded-2xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-5">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">{t("riskCards")}</h4>
              <div className="space-y-2">
                {data.riskCards.slice(0, 5).map((card) => (
                  <div key={card.cardId} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--flux-text)]">{card.cardId}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--flux-chrome-alpha-10)]">
                        <div
                          className={`h-full rounded-full ${card.score > 60 ? "bg-[var(--flux-danger)]" : card.score > 30 ? "bg-[var(--flux-warning)]" : "bg-[var(--flux-success)]"}`}
                          style={{ width: `${card.score}%` }}
                        />
                      </div>
                      <span className="w-8 text-right tabular-nums text-[var(--flux-text-muted)]">{card.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.scopeCreepRatio > 0 && (
            <div className="rounded-xl border border-[var(--flux-warning)]/30 bg-[var(--flux-warning)]/5 p-3 text-xs text-[var(--flux-text)]">
              {t("scopeCreep")}: <strong>{Math.round(data.scopeCreepRatio * 100)}%</strong>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] p-5">
          <h4 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("whatIfTitle")}</h4>
          <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("whatIfHint")}</p>

          <div className="mt-4 space-y-3">
            <label className="block text-[11px] text-[var(--flux-text-muted)]">
              {t("removeItems")}: {removeItems}
              <input
                type="range"
                min={0}
                max={30}
                value={removeItems}
                onChange={(e) => setRemoveItems(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--flux-primary)]"
              />
            </label>
            <label className="block text-[11px] text-[var(--flux-text-muted)]">
              {t("capacityMul")}: {capacityMul.toFixed(2)}×
              <input
                type="range"
                min={25}
                max={250}
                value={Math.round(capacityMul * 100)}
                onChange={(e) => setCapacityMul(Number(e.target.value) / 100)}
                className="mt-1 w-full accent-[var(--flux-primary)]"
              />
            </label>
            <textarea
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              placeholder={t("nlPlaceholder")}
              rows={2}
              className="w-full resize-none rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-dark)] px-3 py-2 text-xs text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
            />
            <button
              type="button"
              className="btn-primary w-full px-4 py-2 text-xs"
              disabled={scenarioLoading}
              onClick={() => void runScenario()}
            >
              {scenarioLoading ? t("scenarioLoading") : t("runScenario")}
            </button>
            {scenarioErr ? <p className="text-xs text-[var(--flux-danger-bright)]">{scenarioErr}</p> : null}
          </div>

          {scenario?.ok ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {renderMonteBlock(t("baseline"), scenario.baseline.monteCarlo)}
                {renderMonteBlock(t("scenarioLabel"), scenario.scenario.monteCarlo)}
              </div>
              <div className="rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-dark)] p-3 text-xs text-[var(--flux-text)]">
                <p className="text-[10px] font-bold uppercase text-[var(--flux-text-muted)]">{t("explanation")}</p>
                <p className="mt-3 whitespace-pre-wrap leading-relaxed">{scenario.explanation}</p>
                {scenario.audit.nlMatches.length > 0 ? (
                  <p className="mt-2 text-[10px] text-[var(--flux-text-muted)]">
                    NL: {scenario.audit.nlMatches.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </DataFadeIn>
  );
}
