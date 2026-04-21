"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
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
import { ReportsEmptyState } from "@/components/reports/reports-empty-state";
import { ReportsErrorState } from "@/components/reports/reports-error-state";
import { ReportsKpiCard } from "@/components/reports/reports-kpi-card";
import { ReportsSectionPlaceholder } from "@/components/reports/reports-section-placeholder";
import {
  REPORTS_CARTESIAN_GRID_STROKE,
  REPORTS_CHART_SERIES_COLORS,
  REPORTS_TOOLTIP_LABEL_STYLE,
} from "@/components/reports/reports-chart-theme";
import { ReportsChartFrame } from "@/components/reports/reports-chart-frame";
import { ReportsTabBar } from "@/components/reports/reports-tab-bar";
import { ReportsInfoCard } from "@/components/reports/reports-info-card";
import { ReportsLssPanel } from "@/components/reports/reports-lss-panel";
import { ReportsTooltip } from "@/components/reports/reports-tooltip";
import { ReportsHeatmapCell } from "@/components/reports/reports-heatmap-cell";
import { ReportsGeneratedAt } from "@/components/reports/reports-generated-at";

const CHART_COLORS = REPORTS_CHART_SERIES_COLORS;

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

function buildSparklinePath(values: number[], width: number, height: number): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = Number((index * step).toFixed(2));
      const y = Number((height - ((value - min) / range) * height).toFixed(2));
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function MiniSparkline({
  values,
  stroke,
}: {
  values: number[];
  stroke: string;
}) {
  const d = useMemo(() => buildSparklinePath(values, 100, 24), [values]);
  if (!d) return <div className="h-6 w-full rounded bg-[var(--flux-chrome-alpha-06)]" aria-hidden />;
  return (
    <svg viewBox="0 0 100 24" className="h-6 w-full" role="img" aria-label="trend">
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BentoTile({
  children,
  delayMs,
  className = "",
  id,
}: {
  children: ReactNode;
  delayMs: number;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 scroll-mt-24 ${className}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {children}
    </section>
  );
}

function ReportsChapterNav({
  chapters,
  label,
}: {
  chapters: { id: string; label: string }[];
  label: string;
}) {
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <nav
      className="flex flex-wrap items-center gap-1.5 border-b border-[var(--flux-chrome-alpha-08)] pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--flux-text-muted)]"
      aria-label={label}
    >
      <span className="mr-1 shrink-0 opacity-70">{label}</span>
      {chapters.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => scrollTo(c.id)}
          className="rounded-full border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)] px-2.5 py-1 text-[10px] font-semibold normal-case tracking-normal text-[var(--flux-text-muted)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-on-surface)] flux-motion-standard"
        >
          {c.label}
        </button>
      ))}
    </nav>
  );
}

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

  const overviewChapters = useMemo(
    () => [
      { id: "flux-reports-chapter-insights", label: t("hub.chapters.insights") },
      { id: "flux-reports-chapter-kpis", label: t("hub.chapters.kpis") },
      { id: "flux-reports-chapter-outlook", label: t("hub.chapters.outlook") },
      { id: "flux-reports-chapter-deps", label: t("hub.chapters.deps") },
      { id: "flux-reports-chapter-cycle", label: t("hub.chapters.cycle") },
      { id: "flux-reports-chapter-sentiment", label: t("hub.chapters.sentiment") },
      { id: "flux-reports-chapter-cfd", label: t("hub.chapters.cfd") },
    ],
    [t]
  );

  if (showSkeleton) {
    return <SkeletonTable rows={6} />;
  }

  if (error || !data) {
    return (
      <ReportsErrorState title={error ? t("loadError") : t("empty")} description={error ? error : t("emptyChart")} />
    );
  }

  return (
    <DataFadeIn active key={data.generatedAt} className="space-y-6">
      <div className="sticky top-[min(3.5rem,env(safe-area-inset-top,0px)+2.5rem)] z-[var(--flux-z-board-sticky-chrome)] -mx-1 space-y-2 rounded-b-[var(--flux-rad)] flux-glass-surface border-x-0 border-t-0 px-1 pb-2 pt-1 flux-depth-1">
        <ReportsTabBar
          items={hubTabs}
          value={hubTab}
          onChange={setHubTab}
          className="flex flex-wrap gap-2 border-0 pb-0"
        />
        {hubTab === "overview" ? (
          <ReportsChapterNav chapters={overviewChapters} label={t("hub.chapters.label")} />
        ) : null}
      </div>

      {hubTab === "lss" ? (
        <ReportsLssPanel
          blurb={t("hub.lssBlurb")}
          cta={t("hub.lssCta")}
          href={`${localeRoot}/reports/lean-six-sigma`}
        />
      ) : null}

      {hubTab === "overview" ? (
        <>
          <div id="flux-reports-chapter-insights" className="grid grid-cols-1 gap-4 lg:grid-cols-12 scroll-mt-24">
            <BentoTile delayMs={0} className="lg:col-span-8">
              <ProactiveAiPanel />
            </BentoTile>
            <BentoTile delayMs={50} className="lg:col-span-4">
              <ReportsInfoCard
                title={t("kpi.atRiskBoards")}
                value={data.aggregates.atRiskCount}
                hint={t("hints.heatmap", { appName })}
                valueClassName="text-[var(--flux-warning-foreground)]"
              />
            </BentoTile>
          </div>

          <section id="flux-reports-chapter-kpis" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 scroll-mt-24">
            <BentoTile delayMs={70}>
              <div className="rounded-[var(--flux-rad)] flux-glass-surface flux-depth-1 p-3">
                <ReportsKpiCard label={t("kpi.boards")} value={data.aggregates.boardCount} tone="primary" hover />
                <MiniSparkline
                  values={data.weeklyThroughput.map((x) => x.concluded)}
                  stroke="var(--flux-primary)"
                />
              </div>
            </BentoTile>
            <BentoTile delayMs={100}>
              <div className="rounded-[var(--flux-rad)] flux-glass-surface flux-depth-1 p-3">
                <ReportsKpiCard label={t("kpi.avgRisk")} value={data.aggregates.avgRisco ?? "—"} tone="secondary" hover />
                <MiniSparkline
                  values={data.portfolioHeatmap.map((x) => x.risco ?? 0)}
                  stroke="var(--flux-secondary)"
                />
              </div>
            </BentoTile>
            <BentoTile delayMs={130}>
              <div className="rounded-[var(--flux-rad)] flux-glass-surface flux-depth-1 p-3">
                <ReportsKpiCard
                  label={t("kpi.avgLead")}
                  value={data.aggregates.avgLeadTimeDays !== null ? `${data.aggregates.avgLeadTimeDays} d` : "—"}
                  tone="neutral"
                  hover
                />
                <MiniSparkline
                  values={data.leadTimeHistogram.map((x) => x.count)}
                  stroke="var(--flux-info)"
                />
              </div>
            </BentoTile>
            <BentoTile delayMs={160}>
              <div className="rounded-[var(--flux-rad)] flux-glass-surface flux-depth-1 p-3">
                <ReportsKpiCard label={t("kpi.atRiskBoards")} value={data.aggregates.atRiskCount} tone="amber" hover />
                <MiniSparkline
                  values={data.createdVsDone.map((x) => x.created - x.concluded)}
                  stroke="var(--flux-warning-foreground)"
                />
              </div>
            </BentoTile>
          </section>

          <div id="flux-reports-chapter-outlook" className="grid grid-cols-1 gap-4 lg:grid-cols-12 scroll-mt-24">
            <BentoTile delayMs={190} className="lg:col-span-7">
              <SprintPredictionPanel prediction={data.sprintPrediction} />
            </BentoTile>
            <BentoTile delayMs={220} className="lg:col-span-5">
              {data.portfolioHeatmap[0]?.boardId ? (
                <DeliveryForecastChart boardId={data.portfolioHeatmap[0].boardId} />
              ) : (
                <ReportsSectionPlaceholder message={t("hub.forecastUnavailable")} />
              )}
            </BentoTile>
          </div>

          <BentoTile delayMs={250} id="flux-reports-chapter-deps">
            <Suspense fallback={<ReportsSectionPlaceholder message={t("dependencies.loading")} />}>
              <CrossBoardDependenciesPanel />
            </Suspense>
          </BentoTile>

          <BentoTile delayMs={280} id="flux-reports-chapter-cycle">
            <CycleTimeScatterPanel points={data.cycleTimeScatter} />
          </BentoTile>

      <div id="flux-reports-chapter-sentiment" className="scroll-mt-24">
      <ChartShell
        title={t("charts.sentiment")}
        hint={t("hints.sentiment")}
        chartId="sentiment"
        explainPayload={{ sentimentHistory: data.sentimentHistory }}
      >
        {!data.sentimentHistory.length ? (
          <ReportsEmptyState message={t("emptyChart")} />
        ) : (
          <ReportsChartFrame heightClassName="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.sentimentHistory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
                <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }}
                  allowDecimals={false}
                />
                <ReportsTooltip formatter={(value: number) => [`${value}/100`, t("series.sentimentScore")]} />
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
          </ReportsChartFrame>
        )}
      </ChartShell>
      </div>

      {!data.meta.copilotHistory ? (
        <p className="text-xs text-[var(--flux-text-muted)]">{t("copilotHint")}</p>
      ) : null}

      <div id="flux-reports-chapter-cfd" className="scroll-mt-24 space-y-3">
        <ReportsTabBar
          items={[
            { id: "accumulated", label: t("cfdTabs.accumulated") },
            { id: "weekly", label: t("cfdTabs.weekly") },
          ]}
          value={cfdTab}
          onChange={setCfdTab}
          compact
        />

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
              <ReportsEmptyState message={t("emptyChart")} />
            ) : (
              <ReportsChartFrame heightClassName="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cfdChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
                    <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                    <ReportsTooltip labelStyle={REPORTS_TOOLTIP_LABEL_STYLE} />
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
              </ReportsChartFrame>
            )}
          </ChartShell>
        )}
      </div>

      <ChartShell
        title={t("charts.throughput")}
        chartId="throughput"
        explainPayload={{ weeklyThroughput: data.weeklyThroughput, createdVsDone: data.createdVsDone }}
      >
        <ReportsChartFrame heightClassName="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.weeklyThroughput} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
              <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
              <ReportsTooltip />
              <Bar dataKey="concluded" name={t("series.concluded")} fill="var(--flux-secondary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportsChartFrame>
      </ChartShell>

      <ChartShell
        title={t("charts.createdVsDone")}
        chartId="createdVsDone"
        explainPayload={{ merged: throughputMerged }}
      >
        <ReportsChartFrame heightClassName="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={throughputMerged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
              <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
              <ReportsTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="created" name={t("series.created")} fill="var(--flux-primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="concluded" name={t("series.concludedCopilot")} fill="var(--flux-secondary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportsChartFrame>
      </ChartShell>

      <ChartShell
        title={t("charts.leadTime")}
        hint={t("hints.leadTime")}
        chartId="leadTime"
        explainPayload={{ leadTimeHistogram: data.leadTimeHistogram }}
      >
        <ReportsChartFrame heightClassName="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.leadTimeHistogram} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
              <ReportsTooltip />
              <Bar dataKey="count" name={t("series.cards")} fill="var(--flux-primary-on-surface)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportsChartFrame>
      </ChartShell>

      <ChartShell
        title={t("charts.heatmap")}
        hint={t("hints.heatmap", { appName })}
        chartId="heatmap"
        explainPayload={{ portfolioHeatmap: data.portfolioHeatmap }}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
          {data.portfolioHeatmap.map((cell) => (
            <ReportsHeatmapCell
              key={cell.boardId}
              name={cell.name}
              risk={cell.risco}
              cardCount={cell.cardCount}
              background={riskHeatColor(cell.risco)}
            />
          ))}
        </div>
      </ChartShell>

      <ChartShell
        title={t("charts.velocity")}
        hint={t("hints.velocity")}
        chartId="velocity"
        explainPayload={{ teamVelocity: data.teamVelocity }}
      >
        <ReportsChartFrame heightClassName="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={velocityData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }}
              />
              <ReportsTooltip />
              <Bar dataKey="moves" name={t("series.cards")} radius={[0, 4, 4, 0]}>
                {velocityData.map((_, i) => (
                  <Cell key={`${i}-${velocityData[i]?.name ?? ""}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ReportsChartFrame>
      </ChartShell>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartShell
          title={t("charts.byColumn")}
          chartId="byColumn"
          explainPayload={{ byColumn: data.distribution.byColumn }}
        >
          <ReportsChartFrame heightClassName="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distribution.byColumn} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
                <XAxis dataKey="label" angle={-25} textAnchor="end" interval={0} height={48} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                <ReportsTooltip />
                <Bar dataKey="count" fill="var(--flux-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ReportsChartFrame>
        </ChartShell>

        <ChartShell
          title={t("charts.byPriority")}
          chartId="byPriority"
          explainPayload={{ byPriority: data.distribution.byPriority }}
        >
          <ReportsChartFrame heightClassName="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distribution.byPriority} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
                <XAxis dataKey="priority" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                <ReportsTooltip />
                <Bar dataKey="count" fill="var(--flux-warning-foreground)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ReportsChartFrame>
        </ChartShell>
      </div>
        </>
      ) : null}

      {hubTab === "kanban" ? (
        <div className="space-y-6">
          <p className="text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("hub.leadCycleNote")}</p>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReportsKpiCard
              label={t("kpi.avgLead")}
              value={data.aggregates.avgLeadTimeDays !== null ? `${data.aggregates.avgLeadTimeDays} d` : "—"}
              tone="neutral"
            />
            <ReportsKpiCard
              label={t("kpi.avgCycleApprox")}
              value={data.aggregates.avgApproxCycleTimeDays != null ? `${data.aggregates.avgApproxCycleTimeDays} d` : "—"}
              tone="secondary"
            />
          </section>
          <CycleTimeScatterPanel points={data.cycleTimeScatter} />
          <ChartShell
            title={t("charts.throughput")}
            hint={t("hub.leadCycleNote")}
            chartId="throughput_run"
            explainPayload={{ weeklyThroughput: data.weeklyThroughput }}
          >
            <ReportsChartFrame heightClassName="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.weeklyThroughput} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
                  <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                  <ReportsTooltip />
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
            </ReportsChartFrame>
          </ChartShell>
          <CfdAccumulatedPanel />
          <ChartShell
            title={t("charts.createdVsDone")}
            chartId="createdVsDone_k"
            explainPayload={{ merged: throughputMerged }}
          >
            <ReportsChartFrame heightClassName="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={throughputMerged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
                  <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                  <ReportsTooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="created" name={t("series.created")} fill="var(--flux-primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="concluded" name={t("series.concludedCopilot")} fill="var(--flux-secondary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ReportsChartFrame>
          </ChartShell>
          <ChartShell title={t("hub.blockersTitle")} chartId="blockers" explainPayload={{ tags: data.blockerTagDistribution }}>
            {!data.blockerTagDistribution?.length ? (
              <ReportsEmptyState message={t("emptyChart")} />
            ) : (
              <ReportsChartFrame heightClassName="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.blockerTagDistribution} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="tag" width={140} tick={{ fill: "var(--flux-text-muted)", fontSize: 10 }} />
                    <ReportsTooltip />
                    <Bar dataKey="count" fill="var(--flux-danger)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ReportsChartFrame>
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
            <ReportsChartFrame heightClassName="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={velocityData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} />
                  <ReportsTooltip />
                  <Bar dataKey="moves" name={t("series.cards")} radius={[0, 4, 4, 0]}>
                    {velocityData.map((_, i) => (
                      <Cell key={`scrum-${i}-${velocityData[i]?.name ?? ""}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ReportsChartFrame>
          </ChartShell>
          <ChartShell
            title={t("hub.sprintVelocityTitle")}
            chartId="sprint_sp"
            explainPayload={{ history: data.sprintStoryPointsHistory }}
          >
            {!sprintSpChart.length ? (
              <ReportsEmptyState message={t("emptyChart")} />
            ) : (
              <ReportsChartFrame heightClassName="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sprintSpChart} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                    <CartesianGrid stroke={REPORTS_CARTESIAN_GRID_STROKE} strokeDasharray="3 3" />
                    <XAxis dataKey="label" angle={-20} textAnchor="end" interval={0} height={56} tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 11 }} allowDecimals={false} />
                    <ReportsTooltip />
                    <Bar dataKey="sp" name="SP" fill="var(--flux-primary-on-surface)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ReportsChartFrame>
            )}
          </ChartShell>
          <ReportsInfoCard
            title={t("hub.dorReadyTitle")}
            value={
              data.scrumDorReady && data.scrumDorReady.eligible > 0
                ? `${Math.round((data.scrumDorReady.ready / data.scrumDorReady.eligible) * 100)}%`
                : "—"
            }
            valueClassName="text-[var(--flux-primary-on-surface)]"
            hint={t("hub.dorReadyHint")}
          />
          <Link
            href={`${localeRoot}/sprints`}
            className="inline-flex rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-4 py-2 text-xs font-semibold text-[var(--flux-primary-on-surface)] hover:border-[var(--flux-primary)]"
          >
            {t("hub.sprintsLink")}
          </Link>
        </div>
      ) : null}

      <ReportsGeneratedAt
        label={t("generatedAt")}
        value={new Date(data.generatedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
      />
    </DataFadeIn>
  );
}
