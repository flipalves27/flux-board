"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { apiGet, apiPost } from "@/lib/api-client";
import type { KanbanCadenceOutput } from "@/lib/ceremony-kanban-cadence";

type CadenceType = "service_delivery_review" | "replenishment" | "flow_review" | "retro_de_fluxo";

type CadenceMeta = { type: CadenceType; label: string; description: string };

type Props = {
  boardId: string;
  boardLabel: string;
  getHeaders: () => Record<string, string>;
};

function isCadenceOutput(x: unknown): x is KanbanCadenceOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.title === "string" && typeof o.summary === "string" && typeof o.type === "string";
}

export function KanbanCadencePanel({ boardId, boardLabel, getHeaders }: Props) {
  const t = useTranslations("ceremonies");
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const [types, setTypes] = useState<CadenceMeta[]>([]);
  const [sel, setSel] = useState<CadenceType>("flow_review");
  const [loading, setLoading] = useState(false);
  const [cadence, setCadence] = useState<KanbanCadenceOutput | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadTypes = useCallback(async () => {
    try {
      const data = await apiGet<{ availableTypes?: CadenceMeta[] }>(
        `/api/boards/${encodeURIComponent(boardId)}/kanban-cadence`,
        getHeaders()
      );
      if (Array.isArray(data.availableTypes)) setTypes(data.availableTypes);
    } catch {
      /* ignore */
    }
  }, [boardId, getHeaders]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  const run = async () => {
    setLoading(true);
    setErr(null);
    setCadence(null);
    try {
      const data = await apiPost<{ cadence?: unknown }>(
        `/api/boards/${encodeURIComponent(boardId)}/kanban-cadence`,
        { type: sel },
        getHeaders()
      );
      const raw = data.cadence ?? data;
      if (isCadenceOutput(raw)) setCadence(raw);
      else setErr(t("cadenceError"));
    } catch {
      setErr(t("cadenceError"));
    } finally {
      setLoading(false);
    }
  };

  const metrics = cadence?.metrics;
  const wipEntries = metrics?.wipByColumn ? Object.entries(metrics.wipByColumn) : [];

  return (
    <section className="rounded-2xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-elevated)] p-4 space-y-3">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("cadenceTitle")}</h2>
        <p className="text-sm text-[var(--flux-text)]">{boardLabel}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
          {t("cadenceType")}
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value as CadenceType)}
            className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm text-[var(--flux-text)]"
          >
            {types.length ? (
              types.map((x) => (
                <option key={x.type} value={x.type}>
                  {x.label}
                </option>
              ))
            ) : (
              <>
                <option value="flow_review">flow_review</option>
                <option value="service_delivery_review">service_delivery_review</option>
                <option value="replenishment">replenishment</option>
                <option value="retro_de_fluxo">retro_de_fluxo</option>
              </>
            )}
          </select>
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void run()}
          className="rounded-lg bg-[var(--flux-accent)] px-3 py-2 text-xs font-semibold text-[var(--flux-surface-dark)] disabled:opacity-50"
        >
          {loading ? t("cadenceRunning") : t("cadenceRun")}
        </button>
      </div>
      {err ? <p className="text-xs text-[var(--flux-danger)]">{err}</p> : null}
      {cadence ? (
        <div className="space-y-4 rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-4">
          <div>
            <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{cadence.title}</h3>
            <p className="mt-1 text-xs text-[var(--flux-text-muted)] leading-relaxed">{cadence.summary}</p>
          </div>

          {metrics && (metrics.avgCycleTimeDays != null || metrics.throughputLastTwoWeeks != null || metrics.blockedCount != null) ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">{t("cadenceMetrics")}</p>
              <ul className="grid gap-1.5 text-xs text-[var(--flux-text)] sm:grid-cols-2">
                {metrics.avgCycleTimeDays != null ? (
                  <li>
                    <span className="text-[var(--flux-text-muted)]">{t("cadenceMetricCycle")}: </span>
                    <span className="font-semibold tabular-nums">{metrics.avgCycleTimeDays}</span>
                  </li>
                ) : null}
                {metrics.throughputLastTwoWeeks != null ? (
                  <li>
                    <span className="text-[var(--flux-text-muted)]">{t("cadenceMetricThroughput")}: </span>
                    <span className="font-semibold tabular-nums">{metrics.throughputLastTwoWeeks}</span>
                  </li>
                ) : null}
                {metrics.blockedCount != null ? (
                  <li>
                    <span className="text-[var(--flux-text-muted)]">{t("cadenceMetricBlocked")}: </span>
                    <span className="font-semibold tabular-nums">{metrics.blockedCount}</span>
                  </li>
                ) : null}
                {metrics.oldestActiveCard ? (
                  <li className="sm:col-span-2">
                    <span className="text-[var(--flux-text-muted)]">{t("cadenceMetricOldest")}: </span>
                    <span className="font-medium">{metrics.oldestActiveCard.title}</span>
                    <span className="text-[var(--flux-text-muted)]"> ({metrics.oldestActiveCard.daysActive}d)</span>
                  </li>
                ) : null}
              </ul>
              {wipEntries.length > 0 ? (
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-1">{t("cadenceWipByColumn")}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {wipEntries.map(([col, n]) => (
                      <li
                        key={col}
                        className="rounded-md border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-elevated)] px-2 py-1 text-[10px] text-[var(--flux-text)]"
                      >
                        <span className="text-[var(--flux-text-muted)] truncate max-w-[140px] inline-block align-bottom">{col}</span>{" "}
                        <span className="font-bold tabular-nums">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {cadence.insights.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">{t("cadenceInsights")}</p>
              <ul className="space-y-2">
                {cadence.insights.map((ins, i) => (
                  <li key={i} className="rounded-lg border border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-xs">
                    <span className="font-semibold text-[var(--flux-primary-light)]">{ins.category}</span>
                    <p className="mt-0.5 text-[var(--flux-text)] leading-snug">{ins.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {cadence.actions.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">{t("cadenceActions")}</p>
              <ul className="list-decimal list-inside space-y-1.5 text-xs text-[var(--flux-text)]">
                {cadence.actions.map((a, i) => (
                  <li key={i} className="leading-snug">
                    {a.text}
                    {a.owner ? <span className="text-[var(--flux-text-muted)]"> — {a.owner}</span> : null}
                    {a.dueDate ? <span className="text-[var(--flux-text-muted)]"> · {a.dueDate}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link
            href={`${localeRoot}/reports`}
            className="inline-flex text-xs font-semibold text-[var(--flux-primary-light)] hover:underline"
          >
            {t("cadenceReportsLink")}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
