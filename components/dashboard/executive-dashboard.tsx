"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { DataFadeIn } from "@/components/ui/data-fade-in";
import { SkeletonTable } from "@/components/skeletons/flux-skeletons";

const CHART_COLORS = [
  "var(--flux-primary)",
  "var(--flux-secondary)",
  "var(--flux-info)",
  "var(--flux-success)",
  "var(--flux-warning-foreground)",
];

const SWR_OPTS = {
  refreshInterval: 5 * 60 * 1000,
  dedupingInterval: 5 * 60 * 1000,
  revalidateOnFocus: false,
  revalidateIfStale: true,
} as const;

export type ExecutiveDashboardPayload = {
  schema: string;
  generatedAt: string;
  quarter: string;
  health: {
    score: number;
    breakdown: {
      throughput: number;
      risco: number;
      wipCompliance: number;
      previsibilidade: number;
      okrProgress: number;
    };
  };
  aggregates: {
    boardCount: number;
    boardsWithCards: number;
    avgRisco: number | null;
    avgThroughput: number | null;
    avgPrevisibilidade: number | null;
    atRiskCount: number;
    avgWipCompliance: number | null;
  };
  okrs: {
    enabled: boolean;
    rings: Array<{ id: string; title: string; progressPct: number; quarter: string }>;
    avgProgressPct: number | null;
  };
  throughputTrend: Array<{ weekLabel: string; concluded: number }>;
  topRiskBoards: Array<{
    id: string;
    name: string;
    clientLabel: string | null;
    risco: number | null;
    throughput: number | null;
    previsibilidade: number | null;
    cardCount: number;
  }>;
  anomalies: Array<{
    id: string;
    severity: string;
    title: string;
    message: string;
    boardName?: string;
    suggestedAction?: string;
    createdAt: string;
    read: boolean;
  }>;
  meta: { boardCount: number; copilotHistory: boolean };
};

function severityStyles(sev: string): string {
  const s = sev.toLowerCase();
  if (s === "critical" || s === "high") return "bg-[var(--flux-danger-alpha-35)] text-[var(--flux-text)]";
  if (s === "medium" || s === "warn" || s === "warning")
    return "bg-[var(--flux-amber-alpha-45)] text-[var(--flux-text)]";
  return "bg-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)]";
}

function OkrRing({ title, pct, color }: { title: string; pct: number; color: string }) {
  const rest = Math.max(0, 100 - pct);
  const data = [
    { name: "progress", value: pct },
    { name: "rest", value: rest },
  ];
  return (
    <div className="flex min-w-[100px] max-w-[140px] flex-col items-center gap-2">
      <div className="h-[100px] w-[100px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={46}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="var(--flux-chrome-alpha-10)" />
            </Pie>
            <Tooltip
              formatter={(v: number, name: string) => (name === "progress" ? [`${v}%`, ""] : null)}
              contentStyle={{
                background: "var(--flux-surface-card)",
                border: "1px solid var(--flux-primary-alpha-25)",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <p className="line-clamp-2 text-center text-[10px] font-semibold leading-tight text-[var(--flux-text)]">
        {title}
      </p>
      <p className="font-mono text-xs text-[var(--flux-text-muted)]">{pct}%</p>
    </div>
  );
}

export function ExecutiveDashboard() {
  const t = useTranslations("executiveDashboard");
  const { getHeaders, token } = useAuth();

  const fetcher = useCallback(async () => {
    return apiGet<ExecutiveDashboardPayload>("/api/executive-dashboard", getHeaders());
  }, [getHeaders]);

  const { data, error, isLoading } = useSWR<ExecutiveDashboardPayload>(
    token ? ["/api/executive-dashboard", token] : null,
    fetcher,
    SWR_OPTS
  );

  const showSkeleton = isLoading && !data;

  const lineData = useMemo(() => data?.throughputTrend ?? [], [data]);

  const handleExportPdf = useCallback(() => {
    window.print();
  }, []);

  if (showSkeleton) {
    return <SkeletonTable rows={5} />;
  }

  if (error || !data) {
    const msg = error instanceof ApiError ? error.message : t("loadError");
    return (
      <div className="rounded-[var(--flux-rad)] border border-[var(--flux-danger-alpha-35)] bg-[var(--flux-danger-alpha-08)] px-4 py-3 text-sm text-[var(--flux-text)]">
        {msg}
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          .exec-no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>

      <div className="exec-print-root space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 exec-no-print">
          <p className="text-[11px] text-[var(--flux-text-muted)]">
            {t("refreshHint")}
          </p>
          <button
            type="button"
            onClick={handleExportPdf}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-primary-light)] transition-colors hover:bg-[var(--flux-primary-alpha-15)]"
          >
            {t("exportPdf")}
          </button>
        </div>

        <DataFadeIn active key={data.generatedAt} className="space-y-6">
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] p-6 lg:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {t("health.title")}
              </p>
              <div className="mt-3 flex items-end gap-2">
                <span
                  className="font-display text-5xl tabular-nums leading-none text-[var(--flux-text)]"
                  style={{
                    color:
                      data.health.score >= 72
                        ? "var(--flux-success)"
                        : data.health.score >= 48
                          ? "var(--flux-warning-foreground)"
                          : "var(--flux-danger)",
                  }}
                >
                  {data.health.score}
                </span>
                <span className="pb-1 text-sm text-[var(--flux-text-muted)]">/ 100</span>
              </div>
              <ul className="mt-4 space-y-1.5 text-[11px] text-[var(--flux-text-muted)]">
                <li>
                  {t("health.throughput")}: {data.health.breakdown.throughput}
                </li>
                <li>
                  {t("health.risk")}: {data.health.breakdown.risco}
                </li>
                <li>
                  {t("health.wip")}: {data.health.breakdown.wipCompliance}
                </li>
                <li>
                  {t("health.compliance")}: {data.health.breakdown.previsibilidade}
                </li>
                <li>
                  {t("health.okr")}: {data.health.breakdown.okrProgress}
                </li>
              </ul>
            </div>

            <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-4 lg:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {t("kpis.title")}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] text-[var(--flux-text-muted)]">{t("kpis.boards")}</p>
                  <p className="font-display text-xl text-[var(--flux-text)]">{data.aggregates.boardCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--flux-text-muted)]">{t("kpis.atRisk")}</p>
                  <p className="font-display text-xl text-[var(--flux-text)]">{data.aggregates.atRiskCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--flux-text-muted)]">{t("kpis.quarter")}</p>
                  <p className="font-display text-xl text-[var(--flux-text)]">{data.quarter}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("okr.title")}</h3>
              {!data.okrs.enabled ? (
                <span className="text-[11px] text-[var(--flux-text-muted)]">{t("okr.planNote")}</span>
              ) : null}
            </div>
            {data.okrs.rings.length === 0 ? (
              <p className="text-sm text-[var(--flux-text-muted)]">{t("okr.empty")}</p>
            ) : (
              <div className="flex flex-wrap justify-start gap-6">
                {data.okrs.rings.map((ring, i) => (
                  <OkrRing
                    key={ring.id}
                    title={ring.title}
                    pct={ring.progressPct}
                    color={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-4">
              <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("anomalies.title")}</h3>
              {data.anomalies.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--flux-text-muted)]">{t("anomalies.empty")}</p>
              ) : (
                <ul className="mt-3 max-h-[min(360px,50vh)] space-y-3 overflow-y-auto overscroll-contain pr-1">
                  {data.anomalies.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-dark)] px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${severityStyles(a.severity)}`}
                        >
                          {a.severity}
                        </span>
                        {a.boardName ? (
                          <span className="text-[10px] text-[var(--flux-text-muted)]">{a.boardName}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-[var(--flux-text)]">{a.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--flux-text-muted)]">{a.message}</p>
                      {a.suggestedAction ? (
                        <p className="mt-2 text-[11px] text-[var(--flux-primary-light)]">
                          <span className="font-semibold">{t("anomalies.suggested")}</span> {a.suggestedAction}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-4">
              <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("throughput.title")}</h3>
              {!data.meta.copilotHistory && lineData.every((d) => d.concluded === 0) ? (
                <p className="mt-3 text-xs text-[var(--flux-text-muted)]">{t("throughput.hint")}</p>
              ) : null}
              <div className="mt-2 h-[min(280px,40vh)] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
                    <XAxis dataKey="weekLabel" tick={{ fill: "var(--flux-text-muted)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--flux-surface-card)",
                        border: "1px solid var(--flux-primary-alpha-25)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="concluded"
                      name={t("throughput.series")}
                      stroke="var(--flux-secondary)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-4">
            <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("risk.title")}</h3>
            {data.topRiskBoards.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--flux-text-muted)]">{t("risk.empty")}</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {data.topRiskBoards.map((b, idx) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-08)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-[var(--flux-text-muted)]">#{idx + 1}</span>{" "}
                      <span className="font-semibold text-[var(--flux-text)]">{b.name}</span>
                      {b.clientLabel ? (
                        <span className="ml-2 text-[11px] text-[var(--flux-text-muted)]">({b.clientLabel})</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-3 font-mono text-[10px] text-[var(--flux-text-muted)]">
                      <span>
                        {t("risk.risk")} {b.risco ?? "—"}
                      </span>
                      <span>
                        {t("risk.throughput")} {b.throughput ?? "—"}
                      </span>
                      <span>
                        {t("risk.cards")} {b.cardCount}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="text-[11px] text-[var(--flux-text-muted)]">
            {t("generatedAt")}{" "}
            {new Date(data.generatedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
          </p>
        </DataFadeIn>
      </div>
    </>
  );
}
