"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet } from "@/lib/api-client";
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

  return (
    <DataFadeIn>
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
    </DataFadeIn>
  );
}
