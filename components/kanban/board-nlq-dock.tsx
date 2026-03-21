"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBoardNlqUiStore, type BoardNlqMetricSnapshot } from "@/stores/board-nlq-ui-store";
import { useToast } from "@/context/toast-context";

type NlqApiResponse =
  | {
      ok: true;
      resultType: "cards";
      cardIds: string[];
      rows: Array<{ id: string; title: string; priority: string; bucketLabel: string }>;
      explanation: string;
    }
  | {
      ok: true;
      resultType: "metric";
      metric: "throughput";
      primaryValue: number;
      compareValue: number | null;
      chart: Array<{ label: string; value: number }>;
      explanation: string;
    }
  | { ok: false; fallbackMessage: string; suggestions: string[] };

type BoardNlqDockProps = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  onExpandFilters: () => void;
};

export function BoardNlqDock({ boardId, getHeaders, onExpandFilters }: BoardNlqDockProps) {
  const t = useTranslations("kanban.board.nlq");
  const { pushToast } = useToast();
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const metric = useBoardNlqUiStore((s) => s.metricByBoard[boardId]);
  const nlqCardIds = useBoardNlqUiStore((s) => s.allowedIdsByBoard[boardId]);
  const setBoardNlqCards = useBoardNlqUiStore((s) => s.setBoardNlqCards);
  const setBoardNlqMetric = useBoardNlqUiStore((s) => s.setBoardNlqMetric);
  const clearBoardNlq = useBoardNlqUiStore((s) => s.clearBoardNlq);

  const hasNlq = Boolean(metric || nlqCardIds !== undefined);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/nlq`, { headers: getHeaders() });
      const data = (await res.json().catch(() => ({}))) as { recent?: string[] };
      if (res.ok && Array.isArray(data.recent)) setRecent(data.recent);
    } catch {
      // ignore
    }
  }, [boardId, getHeaders]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const runQuery = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/nlq`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify({ query: q }),
        });
        const data = (await res.json().catch(() => ({}))) as NlqApiResponse & { error?: string };
        if (!res.ok) {
          pushToast({
            kind: "error",
            title: t("toastTitle"),
            description: data.error || t("errorGeneric"),
          });
          return;
        }
        if (!data.ok) {
          pushToast({
            kind: "info",
            title: t("toastTitle"),
            description: data.fallbackMessage,
          });
          return;
        }
        if (data.resultType === "cards") {
          setBoardNlqMetric(boardId, null);
          setBoardNlqCards(boardId, data.cardIds);
          onExpandFilters();
          pushToast({
            kind: "success",
            title: t("toastTitle"),
            description: data.explanation,
          });
        } else {
          const snap: BoardNlqMetricSnapshot = {
            headline: t("metricHeadline", { value: data.primaryValue }),
            primaryValue: data.primaryValue,
            compareValue: data.compareValue,
            chart: Array.isArray(data.chart) ? data.chart : [],
            explanation: data.explanation,
          };
          setBoardNlqCards(boardId, null);
          setBoardNlqMetric(boardId, snap);
          pushToast({
            kind: "success",
            title: t("toastTitle"),
            description: data.explanation,
          });
        }
        void loadRecent();
      } catch {
        pushToast({ kind: "error", title: t("toastTitle"), description: t("errorGeneric") });
      } finally {
        setLoading(false);
      }
    },
    [boardId, getHeaders, loadRecent, onExpandFilters, pushToast, setBoardNlqCards, setBoardNlqMetric, t]
  );

  return (
    <div className="w-full px-4 sm:px-5 lg:px-6 pt-2 pb-1 border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-06)]">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[min(100%,240px)]">
          <label htmlFor={`nlq-${boardId}`} className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("label")}
          </label>
          <input
            id={`nlq-${boardId}`}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runQuery(draft);
              }
            }}
            list={listId}
            placeholder={t("placeholder")}
            disabled={loading}
            autoComplete="off"
            className="mt-0.5 w-full px-3 py-1.5 rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] text-xs bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[var(--flux-primary-alpha-20)] outline-none"
            aria-label={t("aria")}
          />
          <datalist id={listId}>
            {recent.map((q) => (
              <option key={q} value={q} />
            ))}
          </datalist>
        </div>
        <button
          type="button"
          className="btn-primary text-xs px-3 py-1.5 shrink-0"
          disabled={loading || !draft.trim()}
          onClick={() => void runQuery(draft)}
        >
          {loading ? t("loading") : t("submit")}
        </button>
        {hasNlq ? (
          <button
            type="button"
            className="btn-secondary text-xs px-3 py-1.5 shrink-0"
            onClick={() => {
              clearBoardNlq(boardId);
              pushToast({ kind: "info", title: t("toastTitle"), description: t("cleared") });
            }}
          >
            {t("clear")}
          </button>
        ) : null}
      </div>
      {metric ? (
        <div className="mt-3 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-bold text-[var(--flux-text)]">{metric.headline}</div>
            {metric.compareValue != null ? (
              <div className="text-[11px] text-[var(--flux-text-muted)]">
                {t("compareLabel")}: <span className="font-semibold text-[var(--flux-text)]">{metric.compareValue}</span>
              </div>
            ) : null}
          </div>
          <p className="text-[11px] text-[var(--flux-text-muted)] mt-1 leading-relaxed">{metric.explanation}</p>
          {metric.chart.length > 0 ? (
            <div className="h-[120px] w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metric.chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--flux-text-muted)" }} stroke="var(--flux-chrome-alpha-20)" />
                  <YAxis
                    allowDecimals={false}
                    width={28}
                    tick={{ fontSize: 10, fill: "var(--flux-text-muted)" }}
                    stroke="var(--flux-chrome-alpha-20)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--flux-surface-card)",
                      border: "1px solid var(--flux-border-subtle)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="value" name={t("seriesThroughput")} fill="var(--flux-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      ) : null}
      {nlqCardIds !== undefined ? (
        <p className="text-[11px] text-[var(--flux-text-muted)] mt-2">
          {t("filterActive", { count: nlqCardIds.length })}
        </p>
      ) : null}
      <p className="text-[10px] text-[var(--flux-text-muted)] mt-1.5 opacity-90">{t("hint")}</p>
    </div>
  );
}
