"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { ProactiveAiPanel } from "@/components/reports/proactive-ai-panel";
import { useMinimumSkeletonDuration } from "@/lib/use-minimum-skeleton-duration";
import { DataFadeIn } from "@/components/ui/data-fade-in";
import { SkeletonTable } from "@/components/skeletons/flux-skeletons";

const CHART_COLORS = [
  "var(--flux-primary)",
  "var(--flux-secondary)",
  "var(--flux-warning-foreground)",
  "var(--flux-danger)",
  "var(--flux-primary-light)",
  "var(--flux-success)",
  "var(--flux-accent-dark)",
  "var(--flux-info)",
];

type FluxReportsPayload = {
  schema: string;
  generatedAt: string;
  aggregates: {
    boardCount: number;
    boardsWithCards: number;
    avgRisco: number | null;
    avgThroughput: number | null;
    avgPrevisibilidade: number | null;
    atRiskCount: number;
    avgLeadTimeDays: number | null;
  };
  cfd: {
    keys: string[];
    labels: Record<string, string>;
    rows: Array<Record<string, string | number>>;
    note: string;
  };
  weeklyThroughput: Array<{ weekLabel: string; concluded: number }>;
  createdVsDone: Array<{ weekLabel: string; created: number; concluded: number }>;
  leadTimeHistogram: Array<{ label: string; count: number }>;
  teamVelocity: Array<{ name: string; moves: number }>;
  distribution: {
    byColumn: Array<{ key: string; label: string; count: number }>;
    byPriority: Array<{ priority: string; count: number }>;
  };
  portfolioHeatmap: Array<{
    boardId: string;
    name: string;
    risco: number | null;
    throughput: number | null;
    cardCount: number;
  }>;
  meta: { copilotHistory: boolean; boardCount: number };
};

function riskHeatColor(risco: number | null): string {
  if (risco === null) return "var(--flux-chrome-alpha-08)";
  const danger = 100 - risco;
  if (danger >= 55) return "var(--flux-danger-alpha-55)";
  if (danger >= 35) return "var(--flux-amber-alpha-45)";
  return "var(--flux-reports-heat-low)";
}

function ChartShell({
  title,
  hint,
  children,
  chartId,
  explainPayload,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  chartId: string;
  explainPayload: unknown;
}) {
  const t = useTranslations("reports");
  const { getHeaders } = useAuth();
  const [busy, setBusy] = useState(false);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const explain = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const data = await apiPost<{
        narrative: string;
        generatedWithAI?: boolean;
        errorMessage?: string;
      }>(
        "/api/flux-reports/explain",
        {
          chartId,
          chartTitle: title,
          dataSummary: JSON.stringify(explainPayload),
        },
        getHeaders()
      );
      setNarrative(data.narrative);
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
      } else {
        setErr(t("explainError"));
      }
    } finally {
      setBusy(false);
    }
  }, [chartId, explainPayload, getHeaders, title, t]);

  return (
    <section className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-4 sm:p-5">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{title}</h3>
          {hint ? <p className="mt-1 text-[11px] leading-relaxed text-[var(--flux-text-muted)]">{hint}</p> : null}
        </div>
        <button
          type="button"
          onClick={explain}
          disabled={busy}
          className="shrink-0 rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-40)] bg-[var(--flux-primary-alpha-15)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-primary-light)] transition-colors hover:border-[var(--flux-primary)] disabled:opacity-50"
        >
          {busy ? t("explaining") : t("explain")}
        </button>
      </div>
      {children}
      {err ? <p className="mt-3 text-xs text-[var(--flux-danger)]">{err}</p> : null}
      {narrative ? (
        <div className="mt-3 rounded-[var(--flux-rad-sm)] border border-[var(--flux-secondary-alpha-25)] bg-[var(--flux-secondary-alpha-06)] px-3 py-2.5 text-sm leading-relaxed text-[var(--flux-text)]">
          {narrative}
        </div>
      ) : null}
    </section>
  );
}

export function FluxReportsDashboard() {
  const t = useTranslations("reports");
  const { getHeaders } = useAuth();
  const [data, setData] = useState<FluxReportsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGet<FluxReportsPayload>("/api/flux-reports", getHeaders());
        if (!cancelled) setData(res);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError) {
          setError(e.message);
        } else {
          setError(t("loadError"));
        }
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getHeaders, t]);

  const showSkeleton = useMinimumSkeletonDuration(loading);

  const cfdChartData = useMemo(() => data?.cfd.rows ?? [], [data]);

  const throughputMerged = useMemo(() => {
    if (!data) return [];
    return data.weeklyThroughput.map((w, i) => ({
      weekLabel: w.weekLabel,
      concluded: w.concluded,
      created: data.createdVsDone[i]?.created ?? 0,
    }));
  }, [data]);

  const velocityData = useMemo(() => {
    if (!data) return [];
    return data.teamVelocity.length
      ? data.teamVelocity
      : [{ name: t("noAssignee"), moves: 0 }];
  }, [data, t]);

  if (showSkeleton) {
    return <SkeletonTable rows={6} />;
  }

  if (error || !data) {
    return (
      <div className="rounded-[var(--flux-rad)] border border-[var(--flux-danger-alpha-35)] bg-[var(--flux-danger-alpha-08)] px-4 py-3 text-sm text-[var(--flux-text)]">
        {error ?? t("empty")}
      </div>
    );
  }

  return (
    <DataFadeIn active key={data.generatedAt} className="space-y-6">
      <ProactiveAiPanel />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("kpi.boards")}</p>
          <p className="mt-1 font-display text-2xl text-[var(--flux-text)]">{data.aggregates.boardCount}</p>
        </div>
        <div className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-28)] bg-[var(--flux-surface-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("kpi.avgRisk")}</p>
          <p className="mt-1 font-display text-2xl text-[var(--flux-text)]">{data.aggregates.avgRisco ?? "—"}</p>
        </div>
        <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("kpi.avgLead")}</p>
          <p className="mt-1 font-display text-2xl text-[var(--flux-text)]">
            {data.aggregates.avgLeadTimeDays !== null ? `${data.aggregates.avgLeadTimeDays} d` : "—"}
          </p>
        </div>
        <div className="rounded-[var(--flux-rad)] border border-[var(--flux-amber-alpha-28)] bg-[var(--flux-surface-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("kpi.atRiskBoards")}</p>
          <p className="mt-1 font-display text-2xl text-[var(--flux-text)]">{data.aggregates.atRiskCount}</p>
        </div>
      </section>

      {!data.meta.copilotHistory ? (
        <p className="text-xs text-[var(--flux-text-muted)]">{t("copilotHint")}</p>
      ) : null}

      <ChartShell
        title={t("charts.cfd")}
        hint={data.cfd.note}
        chartId="cfd"
        explainPayload={{ cfd: data.cfd, aggregates: data.aggregates }}
      >
        {data.cfd.keys.length === 0 ? (
          <p className="text-sm text-[var(--flux-text-muted)]">{t("emptyChart")}</p>
        ) : (
          <div className="h-[320px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cfdChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
                <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--flux-surface-card)",
                    border: "1px solid var(--flux-primary-alpha-25)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--flux-text)" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {data.cfd.keys.map((k, idx) => (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={data.cfd.labels[k] ?? k}
                    stackId="1"
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    fillOpacity={0.35}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartShell>

      <ChartShell
        title={t("charts.throughput")}
        chartId="throughput"
        explainPayload={{ weeklyThroughput: data.weeklyThroughput, createdVsDone: data.createdVsDone }}
      >
        <div className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.weeklyThroughput} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
              <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--flux-surface-card)",
                  border: "1px solid var(--flux-primary-alpha-25)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="concluded" name={t("series.concluded")} fill="var(--flux-secondary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartShell>

      <ChartShell
        title={t("charts.createdVsDone")}
        chartId="createdVsDone"
        explainPayload={{ merged: throughputMerged }}
      >
        <div className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={throughputMerged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
              <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--flux-surface-card)",
                  border: "1px solid var(--flux-primary-alpha-25)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="created" name={t("series.created")} fill="var(--flux-primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="concluded" name={t("series.concludedCopilot")} fill="var(--flux-secondary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartShell>

      <ChartShell
        title={t("charts.leadTime")}
        hint={t("hints.leadTime")}
        chartId="leadTime"
        explainPayload={{ leadTimeHistogram: data.leadTimeHistogram }}
      >
        <div className="h-[260px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.leadTimeHistogram} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--flux-surface-card)",
                  border: "1px solid var(--flux-primary-alpha-25)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" name={t("series.cards")} fill="var(--flux-primary-light)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartShell>

      <ChartShell
        title={t("charts.heatmap")}
        hint={t("hints.heatmap")}
        chartId="heatmap"
        explainPayload={{ portfolioHeatmap: data.portfolioHeatmap }}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
          {data.portfolioHeatmap.map((cell) => (
            <div
              key={cell.boardId}
              className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-08)] px-3 py-2.5 text-left transition-transform hover:scale-[1.02]"
              style={{ background: riskHeatColor(cell.risco) }}
            >
              <p className="truncate text-xs font-bold text-[var(--flux-text)]">{cell.name}</p>
              <p className="mt-1 font-mono text-[10px] text-[var(--flux-text-muted)]">
                risco {cell.risco ?? "—"} · {cell.cardCount} cards
              </p>
            </div>
          ))}
        </div>
      </ChartShell>

      <ChartShell
        title={t("charts.velocity")}
        hint={t("hints.velocity")}
        chartId="velocity"
        explainPayload={{ teamVelocity: data.teamVelocity }}
      >
        <div className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={velocityData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--flux-surface-card)",
                  border: "1px solid var(--flux-primary-alpha-25)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="moves" name={t("series.cards")} radius={[0, 4, 4, 0]}>
                {velocityData.map((_, i) => (
                  <Cell key={`${i}-${velocityData[i]?.name ?? ""}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartShell>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartShell
          title={t("charts.byColumn")}
          chartId="byColumn"
          explainPayload={{ byColumn: data.distribution.byColumn }}
        >
          <div className="h-[240px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distribution.byColumn} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
                <XAxis dataKey="label" angle={-25} textAnchor="end" interval={0} height={48} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--flux-surface-card)",
                    border: "1px solid var(--flux-primary-alpha-25)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="var(--flux-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartShell>

        <ChartShell
          title={t("charts.byPriority")}
          chartId="byPriority"
          explainPayload={{ byPriority: data.distribution.byPriority }}
        >
          <div className="h-[240px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distribution.byPriority} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
                <XAxis dataKey="priority" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--flux-surface-card)",
                    border: "1px solid var(--flux-primary-alpha-25)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="var(--flux-warning-foreground)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartShell>
      </div>

      <p className="text-[11px] text-[var(--flux-text-muted)]">
        {t("generatedAt")}{" "}
        {new Date(data.generatedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
      </p>
    </DataFadeIn>
  );
}
