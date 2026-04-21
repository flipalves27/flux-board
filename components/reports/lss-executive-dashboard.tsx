"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { ChartShell } from "@/components/reports/chart-shell";
import { useMinimumSkeletonDuration } from "@/lib/use-minimum-skeleton-duration";
import type { FluxReportsLssPayload } from "@/lib/flux-reports-lss";
import { LSS_AGING_AT_RISK_DAYS } from "@/lib/flux-reports-lss";
import { DataFadeIn } from "@/components/ui/data-fade-in";
import { SkeletonTable } from "@/components/skeletons/flux-skeletons";
import { REPORTS_LSS_CHART_COLORS } from "@/components/reports/reports-chart-theme";

const CHART_COLORS = REPORTS_LSS_CHART_COLORS;

export function LssExecutiveDashboard() {
  const t = useTranslations("reports.lss");
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const { getHeaders } = useAuth();
  const [data, setData] = useState<FluxReportsLssPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGet<FluxReportsLssPayload>("/api/flux-reports/lss", getHeaders());
        if (!cancelled) setData(res);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError) {
          setError(e.status === 402 ? t("upgradeHint") : e.message);
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

  const dmaicChart = useMemo(() => data?.dmaicOpenDistribution ?? [], [data]);
  const weeklyChart = useMemo(() => data?.weeklyCompletions ?? [], [data]);
  const agingChart = useMemo(() => data?.agingOpenWork ?? [], [data]);
  const pareto = useMemo(() => data?.tagPareto ?? [], [data]);
  const spcRows = useMemo(() => data?.individualsSpc ?? [], [data]);
  const spcMean = spcRows[0]?.centerLine ?? null;

  if (showSkeleton) {
    return (
      <div className="space-y-4">
        <SkeletonTable rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--flux-rad)] border border-[var(--flux-danger-alpha-30)] bg-[var(--flux-danger-alpha-08)] px-4 py-3 text-sm text-[var(--flux-danger)]">
        {error}
      </div>
    );
  }

  if (!data) return null;

  if (data.boardCount === 0) {
    return (
      <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-5 py-8 text-center">
        <p className="text-sm text-[var(--flux-text-muted)]">{t("emptyNoLssBoards")}</p>
        <p className="mt-2 text-xs text-[var(--flux-text-muted)]">{t("emptyNoLssBoardsHint")}</p>
      </div>
    );
  }

  return (
    <DataFadeIn active>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`${localeRoot}/reports`}
          className="text-xs font-semibold text-[var(--flux-primary-light)] hover:underline"
        >
          ← {t("backToReports")}
        </Link>
        <p className="text-[11px] text-[var(--flux-text-muted)]">
          {t("generatedAt")}: {new Date(data.generatedAt).toLocaleString(locale === "pt-BR" ? "pt-BR" : "en-US")}
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("kpi.lssBoards")} value={String(data.boardCount)} />
        <KpiCard label={t("kpi.openWip")} value={String(data.totals.openWorkItems)} />
        <KpiCard label={t("kpi.atRiskWip")} value={String(data.totals.atRiskOpenItems)} hint={t("kpi.atRiskHint", { days: LSS_AGING_AT_RISK_DAYS })} />
        <KpiCard label={t("kpi.done8w")} value={String(data.totals.concludedLast8Weeks)} />
      </div>

      {data.okrHints && data.okrHints.length > 0 ? (
        <section className="mb-6 rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-25)] bg-[var(--flux-secondary-alpha-06)] p-4">
          <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("okrBridgeTitle")}</h3>
          <ul className="mt-2 space-y-1 text-xs text-[var(--flux-text-muted)]">
            {data.okrHints.slice(0, 8).map((h, i) => (
              <li key={`${h.objectiveId}-${h.boardId}-${i}`}>
                <span className="text-[var(--flux-text)]">{h.objectiveTitle}</span> — {h.krTitle}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="space-y-5">
        <ChartShell
          chartId="lss_dmaic_open"
          title={t("charts.dmaicOpen")}
          hint={t("hints.dmaicOpen")}
          explainApiPath="/api/flux-reports/lss/explain"
          explainPayload={{ dmaicOpenDistribution: dmaicChart, totals: data.totals }}
        >
          <div className="h-[280px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dmaicChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--flux-chrome-alpha-12)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--flux-text-muted)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--flux-text-muted)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--flux-surface-card)",
                    border: "1px solid var(--flux-border-default)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" name={t("series.openCards")} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartShell>

        <ChartShell
          chartId="lss_weekly_throughput"
          title={t("charts.weeklyDone")}
          hint={t("hints.weeklyDone")}
          explainApiPath="/api/flux-reports/lss/explain"
          explainPayload={{ weeklyCompletions: weeklyChart, totals: data.totals }}
        >
          <div className="h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--flux-chrome-alpha-12)" />
                <XAxis dataKey="weekLabel" tick={{ fontSize: 11, fill: "var(--flux-text-muted)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--flux-text-muted)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--flux-surface-card)",
                    border: "1px solid var(--flux-border-default)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="concluded" name={t("series.completed")} stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartShell>

        <ChartShell
          chartId="lss_aging_open"
          title={t("charts.agingOpen")}
          hint={t("hints.agingOpen")}
          explainApiPath="/api/flux-reports/lss/explain"
          explainPayload={{ agingOpenWork: agingChart, totals: data.totals }}
        >
          <div className="h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--flux-chrome-alpha-12)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--flux-text-muted)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--flux-text-muted)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--flux-surface-card)",
                    border: "1px solid var(--flux-border-default)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" name={t("series.openCards")} fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartShell>

        <ChartShell
          chartId="lss_tag_pareto"
          title={t("charts.tagPareto")}
          hint={t("hints.tagPareto")}
          explainApiPath="/api/flux-reports/lss/explain"
          explainPayload={{ tagPareto: pareto }}
        >
          {!pareto.length ? (
            <p className="text-sm text-[var(--flux-text-muted)]">{t("paretoEmpty")}</p>
          ) : (
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pareto} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--flux-chrome-alpha-12)" />
                  <XAxis dataKey="label" angle={-18} textAnchor="end" interval={0} height={52} tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--flux-text-muted)" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--flux-surface-card)",
                      border: "1px solid var(--flux-border-default)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" name={t("series.openCards")} fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartShell>

        <ChartShell
          chartId="lss_individuals_spc"
          title={t("charts.individualsSpc")}
          hint={t("hints.individualsSpc")}
          explainApiPath="/api/flux-reports/lss/explain"
          explainPayload={{ individualsSpc: spcRows, note: data.individualsSpcNote }}
        >
          {!spcRows.length ? (
            <p className="text-sm text-[var(--flux-text-muted)]">{t("spcEmpty")}</p>
          ) : (
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spcRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--flux-chrome-alpha-12)" />
                  <XAxis dataKey="idx" tick={{ fontSize: 11, fill: "var(--flux-text-muted)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--flux-text-muted)" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--flux-surface-card)",
                      border: "1px solid var(--flux-border-default)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  {spcMean != null ? (
                    <ReferenceLine y={spcMean} stroke="var(--flux-secondary)" strokeDasharray="4 4" />
                  ) : null}
                  <Line type="monotone" dataKey="cycleDays" name="Cycle d" stroke={CHART_COLORS[0]} strokeWidth={2} dot />
                  <Line type="stepAfter" dataKey="ucl" name="UCL" stroke="var(--flux-danger)" strokeWidth={1} dot={false} />
                  <Line type="stepAfter" dataKey="lcl" name="LCL" stroke="var(--flux-danger)" strokeWidth={1} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartShell>

        {data.capability ? (
          <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4 sm:p-5">
            <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("charts.capability")}</h3>
            <p className="mt-2 text-xs text-[var(--flux-text)]">
              {t("capabilitySample", {
                n: data.capability.sampleSize,
                mean: data.capability.meanDays,
                usl: data.capability.uslDays ?? "—",
              })}
            </p>
            {data.capability.cp != null && data.capability.cpk != null ? (
              <p className="mt-1 text-sm font-semibold text-[var(--flux-primary-light)]">
                {t("capabilityCpk", { cp: data.capability.cp, cpk: data.capability.cpk })}
              </p>
            ) : null}
            <p className="mt-2 text-[11px] text-[var(--flux-text-muted)] leading-relaxed">{t("hints.capability")}</p>
          </div>
        ) : null}

        <section className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-04)] p-4 sm:p-5">
          <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("tollgateTitle")}</h3>
          <p className="mt-2 text-xs leading-relaxed text-[var(--flux-text-muted)]">{t("tollgateBody")}</p>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--flux-text-muted)]">{t("sipocHint")}</p>
        </section>

        <section className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-4 sm:p-5">
          <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("portfolioTitle")}</h3>
          <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("portfolioHint")}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--flux-border-muted)] text-[var(--flux-text-muted)]">
                  <th className="py-2 pr-2 font-semibold">{t("table.board")}</th>
                  <th className="py-2 pr-2 font-semibold">{t("table.open")}</th>
                  <th className="py-2 pr-2 font-semibold">{t("table.atRisk")}</th>
                  <th className="py-2 pr-2 font-semibold">{t("table.maxAge")}</th>
                  <th className="py-2 font-semibold">DMAIC</th>
                </tr>
              </thead>
              <tbody>
                {data.boards.map((row) => (
                  <tr key={row.boardId} className="border-b border-[var(--flux-chrome-alpha-08)] text-[var(--flux-text)]">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{row.name}</div>
                      {row.clientLabel ? (
                        <div className="text-[10px] text-[var(--flux-text-muted)]">{row.clientLabel}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2">{row.openCount}</td>
                    <td className="py-2 pr-2">{row.openAtRiskCount}</td>
                    <td className="py-2 pr-2">{row.maxOpenAgingDays}d</td>
                    <td className="py-2 font-mono text-[10px] text-[var(--flux-text-muted)]">
                      D{row.cardsByPhase.define} M{row.cardsByPhase.measure} A{row.cardsByPhase.analyze} I
                      {row.cardsByPhase.improve} C{row.cardsByPhase.control}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DataFadeIn>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-[var(--flux-text)]">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-[var(--flux-text-muted)]">{hint}</p> : null}
    </div>
  );
}
