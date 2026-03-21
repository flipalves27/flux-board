"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import type { CycleTimeScatterPoint } from "@/lib/flux-reports-metrics";
import { computeCycleTimePercentiles } from "@/lib/flux-reports-metrics";
import { ChartShell } from "@/components/reports/chart-shell";

const DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITY_FILL: Record<string, string> = {
  Urgente: "var(--flux-danger)",
  Importante: "var(--flux-warning-foreground)",
  Média: "var(--flux-info)",
  Media: "var(--flux-info)",
  Baixa: "var(--flux-text-muted)",
};

const FALLBACK_SCATTER = [
  "var(--flux-primary)",
  "var(--flux-secondary)",
  "var(--flux-success)",
  "var(--flux-accent-dark)",
];

function colorForPriority(priority: string, idx: number): string {
  const p = priority.trim();
  if (PRIORITY_FILL[p]) return PRIORITY_FILL[p];
  return FALLBACK_SCATTER[Math.abs(idx) % FALLBACK_SCATTER.length];
}

type PeriodKey = "7d" | "30d" | "90d" | "all";

export function CycleTimeScatterPanel({ points }: { points: CycleTimeScatterPoint[] }) {
  const t = useTranslations("reports.cycleTime");
  const locale = useLocale();
  const [period, setPeriod] = useState<PeriodKey>("90d");
  const [priority, setPriority] = useState<string>("__all__");
  const [exportBusy, setExportBusy] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const priorityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of points) {
      if (p.priority.trim()) set.add(p.priority.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, locale));
  }, [points, locale]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let startMs = 0;
    if (period === "7d") startMs = now - 7 * DAY_MS;
    else if (period === "30d") startMs = now - 30 * DAY_MS;
    else if (period === "90d") startMs = now - 90 * DAY_MS;

    return points.filter((p) => {
      if (period !== "all" && p.completedMs < startMs) return false;
      if (priority !== "__all__" && p.priority.trim() !== priority) return false;
      return true;
    });
  }, [points, period, priority]);

  const legendPriorities = useMemo(() => {
    const set = new Set<string>();
    for (const p of filtered) {
      if (p.priority.trim()) set.add(p.priority.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, locale));
  }, [filtered, locale]);

  const chartData = useMemo(
    () =>
      filtered.map((p) => ({
        x: p.completedMs,
        y: p.cycleDays,
        ...p,
      })),
    [filtered]
  );

  const percentiles = useMemo(() => {
    const days = filtered.map((p) => p.cycleDays);
    return computeCycleTimePercentiles(days);
  }, [filtered]);

  const explainPayload = useMemo(
    () => ({
      count: filtered.length,
      period,
      priority,
      percentiles,
      sample: filtered.slice(0, 12),
    }),
    [filtered, period, priority, percentiles]
  );

  const formatShortDate = useCallback(
    (ms: number) =>
      new Date(ms).toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      }),
    [locale]
  );

  const exportPng = useCallback(async () => {
    const el = exportRef.current;
    if (!el) return;
    setExportBusy(true);
    try {
      const mod = await import("html2canvas");
      const html2canvas = mod.default;
      const cssCard = getComputedStyle(document.documentElement).getPropertyValue("--flux-surface-card").trim();
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: cssCard && cssCard !== "" ? cssCard : "#141418",
        logging: false,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `flux-cycle-time-scatter-${Date.now()}.png`;
      a.click();
    } finally {
      setExportBusy(false);
    }
  }, []);

  return (
    <ChartShell title={t("title")} hint={t("hint")} chartId="cycleTimeScatter" explainPayload={explainPayload}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[11px] text-[var(--flux-text-muted)]">
          <span className="font-semibold">{t("period")}</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-dark)] px-2 py-1 text-xs text-[var(--flux-text)]"
          >
            <option value="7d">{t("p7")}</option>
            <option value="30d">{t("p30")}</option>
            <option value="90d">{t("p90")}</option>
            <option value="all">{t("pAll")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-[var(--flux-text-muted)]">
          <span className="font-semibold">{t("priority")}</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-dark)] px-2 py-1 text-xs text-[var(--flux-text)]"
          >
            <option value="__all__">{t("priorityAll")}</option>
            {priorityOptions.map((pr) => (
              <option key={pr} value={pr}>
                {pr}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={exportPng}
          disabled={exportBusy || !chartData.length}
          className="ml-auto rounded-[var(--flux-rad-sm)] border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-08)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-text)] transition-colors hover:border-[var(--flux-secondary)] disabled:opacity-50"
        >
          {exportBusy ? t("exporting") : t("exportPng")}
        </button>
      </div>

      {percentiles ? (
        <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-[var(--flux-text-muted)]">
          <span>
            <span className="font-semibold text-[var(--flux-info)]">P50</span> {percentiles.p50.toFixed(1)} {t("daysAbbr")}
          </span>
          <span>
            <span className="font-semibold text-[var(--flux-warning-foreground)]">P85</span>{" "}
            {percentiles.p85.toFixed(1)} {t("daysAbbr")}
          </span>
          <span>
            <span className="font-semibold text-[var(--flux-danger)]">P95</span> {percentiles.p95.toFixed(1)} {t("daysAbbr")}
          </span>
        </div>
      ) : null}

      {!chartData.length ? (
        <p className="text-sm text-[var(--flux-text-muted)]">{t("emptyChart")}</p>
      ) : (
        <div ref={exportRef} className="rounded-[var(--flux-rad-sm)] bg-[var(--flux-surface-dark)] p-2">
          <div className="h-[340px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="var(--flux-chrome-alpha-06)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fill: "var(--flux-text-muted)", fontSize: 10 }}
                  tickFormatter={(v) => formatShortDate(Number(v))}
                  name={t("axisDone")}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  tick={{ fill: "var(--flux-text-muted)", fontSize: 10 }}
                  label={{ value: t("axisDays"), angle: -90, position: "insideLeft", fill: "var(--flux-text-muted)", fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as CycleTimeScatterPoint & { x: number; y: number };
                    const flow =
                      d.boardFlowLabels.length > 0 ? d.boardFlowLabels.join(" → ") : t("flowUnknown");
                    return (
                      <div
                        className="max-w-xs rounded-lg border border-[var(--flux-primary-alpha-25)] px-3 py-2 text-xs shadow-lg"
                        style={{
                          background: "var(--flux-surface-card)",
                          color: "var(--flux-text)",
                        }}
                      >
                        <p className="font-bold leading-snug text-[var(--flux-text)]">{d.title}</p>
                        <p className="mt-1 text-[var(--flux-text-muted)]">
                          {d.boardName} · {t("tooltipPriority")}: {d.priority}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-[var(--flux-primary-light)]">
                          {t("tooltipCycle")}: {d.cycleDays} {t("daysAbbr")} · {formatShortDate(d.completedMs)}
                        </p>
                        <p className="mt-2 border-t border-[var(--flux-chrome-alpha-08)] pt-2 text-[11px] leading-relaxed text-[var(--flux-text-muted)]">
                          {t("tooltipFlow")}: {flow}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">
                          {t("tooltipColumnDone")}: {d.bucketAtDoneLabel}
                        </p>
                      </div>
                    );
                  }}
                />
                {percentiles ? (
                  <>
                    <ReferenceLine
                      y={percentiles.p50}
                      stroke="var(--flux-info)"
                      strokeDasharray="4 4"
                      label={{ value: "P50", fill: "var(--flux-info)", fontSize: 10 }}
                    />
                    <ReferenceLine
                      y={percentiles.p85}
                      stroke="var(--flux-warning-foreground)"
                      strokeDasharray="4 4"
                      label={{ value: "P85", fill: "var(--flux-warning-foreground)", fontSize: 10 }}
                    />
                    <ReferenceLine
                      y={percentiles.p95}
                      stroke="var(--flux-danger)"
                      strokeDasharray="4 4"
                      label={{ value: "P95", fill: "var(--flux-danger)", fontSize: 10 }}
                    />
                  </>
                ) : null}
                <Scatter name={t("seriesName")} data={chartData} fill="var(--flux-primary)">
                  {chartData.map((entry, index) => (
                    <Cell key={`${entry.cardId}-${entry.x}`} fill={colorForPriority(entry.priority, index)} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          {legendPriorities.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--flux-chrome-alpha-08)] px-2 pb-1 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {t("legendPriority")}
              </span>
              {legendPriorities.map((pr, i) => (
                <span key={pr} className="flex items-center gap-1.5 text-[10px] text-[var(--flux-text)]">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorForPriority(pr, i) }} />
                  {pr}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </ChartShell>
  );
}
