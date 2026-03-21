"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { ChartShell } from "@/components/reports/chart-shell";

type CfdDailyPayload = {
  schema: string;
  periodDays: number;
  fromDay?: string;
  toDay?: string;
  keys: string[];
  labels: Record<string, string>;
  colors: Record<string, string>;
  rows: Array<Record<string, string | number>>;
  wipRising: boolean;
  distinctSnapshotDays: number;
  note?: string;
  serverMs?: number;
};

const PERIODS = [14, 30, 90] as const;

function CfdDailyTooltip(props: {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ dataKey?: unknown; name?: string; value?: number }>;
  wipRising: boolean;
  wipAlert: string;
}) {
  const { active, label, payload, wipRising, wipAlert } = props;
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border border-[var(--flux-primary-alpha-25)] px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--flux-surface-card)" }}
    >
      <p className="mb-1.5 font-semibold text-[var(--flux-text)]">{label}</p>
      <ul className="space-y-0.5 text-[var(--flux-text)]">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex justify-between gap-4">
            <span className="text-[var(--flux-text-muted)]">{p.name}</span>
            <span className="font-mono tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
      {wipRising ? (
        <p className="mt-2 border-t border-[var(--flux-chrome-alpha-10)] pt-2 text-[var(--flux-warning-foreground)]">
          {wipAlert}
        </p>
      ) : null}
    </div>
  );
}

export function CfdAccumulatedPanel() {
  const t = useTranslations("reports.cfdDaily");
  const { getHeaders } = useAuth();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(14);
  const [data, setData] = useState<CfdDailyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<CfdDailyPayload>(`/api/flux-reports/cfd-daily?period=${period}`, getHeaders());
      setData(res);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(t("loadError"));
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [getHeaders, period, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartRows = useMemo(() => data?.rows ?? [], [data]);

  if (loading && !data) {
    return (
      <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] px-4 py-8 text-sm text-[var(--flux-text-muted)]">
        {t("loading")}
      </div>
    );
  }

  const chartBusy = loading && !!data;

  if (error || !data) {
    return (
      <div className="rounded-[var(--flux-rad)] border border-[var(--flux-danger-alpha-35)] bg-[var(--flux-danger-alpha-08)] px-4 py-3 text-sm text-[var(--flux-text)]">
        {error ?? t("empty")}
      </div>
    );
  }

  const hasKeys = data.keys.length > 0;
  const sparseHistory = data.distinctSnapshotDays < 14 && data.periodDays >= 14;

  return (
    <ChartShell
      title={t("title")}
      hint={data.note}
      chartId="cfdDaily"
      explainPayload={{
        cfdDaily: {
          periodDays: data.periodDays,
          wipRising: data.wipRising,
          distinctSnapshotDays: data.distinctSnapshotDays,
          keys: data.keys,
        },
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-[var(--flux-text-muted)]">{t("period")}</span>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              disabled={loading}
              className={`rounded-[var(--flux-rad-sm)] px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                period === p
                  ? "border border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
                  : "border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-04)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-08)]"
              }`}
            >
              {p === 14 ? t("p14") : p === 30 ? t("p30") : t("p90")}
            </button>
          ))}
        </div>
      </div>

      {data.wipRising ? (
        <p className="mb-3 rounded-[var(--flux-rad-sm)] border border-[var(--flux-amber-alpha-35)] bg-[var(--flux-amber-alpha-08)] px-3 py-2 text-xs leading-relaxed text-[var(--flux-text)]">
          {t("wipRisingBanner")}
        </p>
      ) : null}

      {sparseHistory ? (
        <p className="mb-3 text-xs text-[var(--flux-warning-foreground)]">{t("sparseHistory")}</p>
      ) : null}

      {!hasKeys || !chartRows.length ? (
        <p className="text-sm text-[var(--flux-text-muted)]">{t("emptyChart")}</p>
      ) : (
        <div className={`h-[340px] w-full min-w-0 transition-opacity ${chartBusy ? "opacity-60" : ""}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
              <XAxis dataKey="dayLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                content={(tipProps) => (
                  <CfdDailyTooltip
                    active={tipProps.active}
                    label={tipProps.label}
                    payload={
                      tipProps.payload as ReadonlyArray<{ dataKey?: unknown; name?: string; value?: number }> | undefined
                    }
                    wipRising={data.wipRising}
                    wipAlert={t("tooltipWipAlert")}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.keys.map((k) => (
                <Area
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={data.labels[k] ?? k}
                  stackId="cfd"
                  stroke={data.colors[k] ?? "var(--flux-primary)"}
                  fill={data.colors[k] ?? "var(--flux-primary)"}
                  fillOpacity={0.38}
                  isAnimationActive={chartRows.length <= 120}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartShell>
  );
}
