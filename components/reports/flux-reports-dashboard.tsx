"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { ChartShell } from "@/components/reports/chart-shell";
import { ProactiveAiPanel } from "@/components/reports/proactive-ai-panel";
import { SprintPredictionPanel } from "@/components/reports/sprint-prediction-panel";
import { CrossBoardDependenciesPanel } from "@/components/reports/cross-board-dependencies-panel";
import { CfdAccumulatedPanel } from "@/components/reports/cfd-accumulated-panel";
import { CycleTimeScatterPanel } from "@/components/reports/cycle-time-scatter-panel";
import { DeliveryForecastChart } from "@/components/reports/delivery-forecast-chart";
import type { CycleTimeScatterPoint } from "@/lib/flux-reports-metrics";
import type { SprintPredictionPayload } from "@/lib/sprint-prediction-metrics";
import { useMinimumSkeletonDuration } from "@/lib/use-minimum-skeleton-duration";
import { usePlatformDisplayName } from "@/context/org-branding-context";
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

type SprintStoryPointsRow = {
  boardId: string;
  boardName: string;
  sprintId: string;
  sprintName: string;
  endDate: string | null;
  completedStoryPoints: number;
  goal: string;
};

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
    avgApproxCycleTimeDays?: number | null;
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
  sprintPrediction: SprintPredictionPayload;
  sentimentHistory: Array<{ weekLabel: string; avgScore: number; boardCount: number }>;
  cycleTimeScatter: CycleTimeScatterPoint[];
  dependencySuggestions?: Array<{
    boardIdA: string;
    cardIdA: string;
    boardIdB: string;
    cardIdB: string;
    score: number;
  }>;
  blockerTagDistribution?: Array<{ tag: string; count: number }>;
  scrumDorReady?: { eligible: number; ready: number };
  sprintStoryPointsHistory?: SprintStoryPointsRow[];
};

function riskHeatColor(risco: number | null): string {
  if (risco === null) return "var(--flux-chrome-alpha-08)";
  const danger = 100 - risco;
  if (danger >= 55) return "var(--flux-danger-alpha-55)";
  if (danger >= 35) return "var(--flux-amber-alpha-45)";
  return "var(--flux-reports-heat-low)";
}

type ReportsHubTab = "overview" | "kanban" | "scrum" | "lss";

export function FluxReportsDashboard() {
  const t = useTranslations("reports");
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const appName = usePlatformDisplayName();
  const { getHeaders } = useAuth();
  const [data, setData] = useState<FluxReportsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cfdTab, setCfdTab] = useState<"accumulated" | "weekly">("accumulated");
  const [hubTab, setHubTab] = useState<ReportsHubTab>("overview");

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

  const sprintSpChart = useMemo(() => {
    if (!data?.sprintStoryPointsHistory?.length) return [];
    return data.sprintStoryPointsHistory.slice(-16).map((r, i) => ({
      key: `${r.sprintId}-${i}`,
      label:
        r.sprintName.length > 14
          ? `${r.sprintName.slice(0, 12)}…`
          : r.sprintName || r.sprintId.slice(0, 8),
      sp: r.completedStoryPoints,
    }));
  }, [data]);

  const hubTabs: { id: ReportsHubTab; label: string }[] = [
    { id: "overview", label: t("hub.tabs.overview") },
    { id: "kanban", label: t("hub.tabs.kanban") },
    { id: "scrum", label: t("hub.tabs.scrum") },
    { id: "lss", label: t("hub.tabs.lss") },
  ];

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
      <div className="flex flex-wrap gap-2 border-b border-[var(--flux-chrome-alpha-08)] pb-3">
        {hubTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setHubTab(tab.id)}
            className={`rounded-[var(--flux-rad-sm)] px-3 py-2 text-xs font-semibold transition-colors ${
              hubTab === tab.id
                ? "border border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
                : "border border-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {hubTab === "lss" ? (
        <div className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-28)] bg-[var(--flux-surface-card)] p-6">
          <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">{t("hub.lssBlurb")}</p>
          <Link
            href={`${localeRoot}/reports/lean-six-sigma`}
            className="mt-4 inline-flex rounded-[var(--flux-rad-sm)] border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] px-4 py-2 text-xs font-semibold text-[var(--flux-primary-light)] hover:border-[var(--flux-primary)]"
          >
            {t("hub.lssCta")}
          </Link>
        </div>
      ) : null}

      {hubTab === "overview" ? (
        <>
          <ProactiveAiPanel />

          <Suspense
            fallback={
              <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] px-4 py-6 text-sm text-[var(--flux-text-muted)]">
                {t("dependencies.loading")}
              </div>
            }
          >
            <CrossBoardDependenciesPanel />
          </Suspense>

      <SprintPredictionPanel prediction={data.sprintPrediction} />

      {data.portfolioHeatmap[0]?.boardId ? (
        <DeliveryForecastChart boardId={data.portfolioHeatmap[0].boardId} />
      ) : null}

      <CycleTimeScatterPanel points={data.cycleTimeScatter} />

      <ChartShell
        title={t("charts.sentiment")}
        hint={t("hints.sentiment")}
        chartId="sentiment"
        explainPayload={{ sentimentHistory: data.sentimentHistory }}
      >
        {!data.sentimentHistory.length ? (
          <p className="text-sm text-[var(--flux-text-muted)]">{t("emptyChart")}</p>
        ) : (
          <div className="h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.sentimentHistory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
                <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--flux-surface-card)",
                    border: "1px solid var(--flux-primary-alpha-25)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${value}/100`, t("series.sentimentScore")]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="avgScore"
                  name={t("series.sentimentScore")}
                  stroke="var(--flux-info)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartShell>

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

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 border-b border-[var(--flux-chrome-alpha-08)] pb-2">
          <button
            type="button"
            onClick={() => setCfdTab("accumulated")}
            className={`rounded-[var(--flux-rad-sm)] px-3 py-1.5 text-xs font-semibold transition-colors ${
              cfdTab === "accumulated"
                ? "border border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
                : "border border-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
            }`}
          >
            {t("cfdTabs.accumulated")}
          </button>
          <button
            type="button"
            onClick={() => setCfdTab("weekly")}
            className={`rounded-[var(--flux-rad-sm)] px-3 py-1.5 text-xs font-semibold transition-colors ${
              cfdTab === "weekly"
                ? "border border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
                : "border border-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
            }`}
          >
            {t("cfdTabs.weekly")}
          </button>
        </div>

        {cfdTab === "accumulated" ? (
          <CfdAccumulatedPanel />
        ) : (
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
        )}
      </div>

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
        hint={t("hints.heatmap", { appName })}
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
        </>
      ) : null}

      {hubTab === "kanban" ? (
        <div className="space-y-6">
          <p className="text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("hub.leadCycleNote")}</p>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("kpi.avgLead")}</p>
              <p className="mt-1 font-display text-2xl text-[var(--flux-text)]">
                {data.aggregates.avgLeadTimeDays !== null ? `${data.aggregates.avgLeadTimeDays} d` : "—"}
              </p>
            </div>
            <div className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-28)] bg-[var(--flux-surface-card)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {t("kpi.avgCycleApprox")}
              </p>
              <p className="mt-1 font-display text-2xl text-[var(--flux-text)]">
                {data.aggregates.avgApproxCycleTimeDays != null ? `${data.aggregates.avgApproxCycleTimeDays} d` : "—"}
              </p>
            </div>
          </section>
          <CycleTimeScatterPanel points={data.cycleTimeScatter} />
          <ChartShell
            title={t("charts.throughput")}
            hint={t("hub.leadCycleNote")}
            chartId="throughput_run"
            explainPayload={{ weeklyThroughput: data.weeklyThroughput }}
          >
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.weeklyThroughput} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  <Line
                    type="monotone"
                    dataKey="concluded"
                    name={t("series.concluded")}
                    stroke="var(--flux-secondary)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartShell>
          <CfdAccumulatedPanel />
          <ChartShell
            title={t("charts.createdVsDone")}
            chartId="createdVsDone_k"
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
          <ChartShell title={t("hub.blockersTitle")} chartId="blockers" explainPayload={{ tags: data.blockerTagDistribution }}>
            {!data.blockerTagDistribution?.length ? (
              <p className="text-sm text-[var(--flux-text-muted)]">{t("emptyChart")}</p>
            ) : (
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.blockerTagDistribution} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="tag" width={140} tick={{ fill: "var(--flux-text-muted)", fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--flux-surface-card)",
                        border: "1px solid var(--flux-primary-alpha-25)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="var(--flux-danger)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartShell>
        </div>
      ) : null}

      {hubTab === "scrum" ? (
        <div className="space-y-6">
          <SprintPredictionPanel prediction={data.sprintPrediction} />
          <ChartShell
            title={t("charts.velocity")}
            hint={t("hints.velocity")}
            chartId="velocity_scrum"
            explainPayload={{ teamVelocity: data.teamVelocity }}
          >
            <div className="h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={velocityData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
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
                      <Cell key={`scrum-${i}-${velocityData[i]?.name ?? ""}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartShell>
          <ChartShell
            title={t("hub.sprintVelocityTitle")}
            chartId="sprint_sp"
            explainPayload={{ history: data.sprintStoryPointsHistory }}
          >
            {!sprintSpChart.length ? (
              <p className="text-sm text-[var(--flux-text-muted)]">{t("emptyChart")}</p>
            ) : (
              <div className="h-[280px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sprintSpChart} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                    <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" angle={-20} textAnchor="end" interval={0} height={56} tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--flux-surface-card)",
                        border: "1px solid var(--flux-primary-alpha-25)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="sp" name="SP" fill="var(--flux-primary-light)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartShell>
          <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4">
            <p className="text-xs font-semibold text-[var(--flux-text)]">{t("hub.dorReadyTitle")}</p>
            <p className="mt-2 font-display text-2xl text-[var(--flux-primary-light)]">
              {data.scrumDorReady && data.scrumDorReady.eligible > 0
                ? `${Math.round((data.scrumDorReady.ready / data.scrumDorReady.eligible) * 100)}%`
                : "—"}
            </p>
            <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("hub.dorReadyHint")}</p>
          </div>
          <Link
            href={`${localeRoot}/sprints`}
            className="inline-flex rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-4 py-2 text-xs font-semibold text-[var(--flux-primary-light)] hover:border-[var(--flux-primary)]"
          >
            {t("hub.sprintsLink")}
          </Link>
        </div>
      ) : null}

      <p className="text-[11px] text-[var(--flux-text-muted)]">
        {t("generatedAt")}{" "}
        {new Date(data.generatedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
      </p>
    </DataFadeIn>
  );
}
