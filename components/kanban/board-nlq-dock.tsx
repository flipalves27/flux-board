"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBoardNlqUiStore, type BoardNlqMetricSnapshot } from "@/stores/board-nlq-ui-store";
import { useToast } from "@/context/toast-context";
import { AiModelHint } from "@/components/ai-model-hint";
import { CustomTooltip } from "@/components/ui/custom-tooltip";

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

type NlqPostBody = NlqApiResponse & { llmModel?: string; error?: string };

type BoardNlqDockProps = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  onExpandFilters: () => void;
};

const nlqExpandedStorageKey = (boardId: string) => `flux-board.nlqDock.expanded.${boardId}`;

export function BoardNlqDock({ boardId, getHeaders, onExpandFilters }: BoardNlqDockProps) {
  const t = useTranslations("kanban.board.nlq");
  const { pushToast } = useToast();
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(nlqExpandedStorageKey(boardId));
      if (v === "false") setPanelExpanded(false);
      if (v === "true") setPanelExpanded(true);
    } catch {
      /* ignore */
    }
  }, [boardId]);

  useEffect(() => {
    try {
      localStorage.setItem(nlqExpandedStorageKey(boardId), panelExpanded ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [boardId, panelExpanded]);

  const metric = useBoardNlqUiStore((s) => s.metricByBoard[boardId]);
  const nlqCardIds = useBoardNlqUiStore((s) => s.allowedIdsByBoard[boardId]);
  const nlqLlmMeta = useBoardNlqUiStore((s) => s.nlqLlmMetaByBoard[boardId]);
  const setBoardNlqCards = useBoardNlqUiStore((s) => s.setBoardNlqCards);
  const setBoardNlqMetric = useBoardNlqUiStore((s) => s.setBoardNlqMetric);
  const setNlqLlmMeta = useBoardNlqUiStore((s) => s.setNlqLlmMeta);
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
      setPanelExpanded(true);
      try {
        const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/nlq`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify({ query: q }),
        });
        const data = (await res.json().catch(() => ({}))) as NlqPostBody;
        if (!res.ok) {
          pushToast({
            kind: "error",
            title: t("toastTitle"),
            description: data.error || t("errorGeneric"),
          });
          return;
        }
        const llmMeta =
          typeof data.llmModel === "string" && data.llmModel.trim()
            ? { model: data.llmModel.trim(), provider: "Together" as const }
            : null;
        setNlqLlmMeta(boardId, llmMeta);
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
    [boardId, getHeaders, loadRecent, onExpandFilters, pushToast, setBoardNlqCards, setBoardNlqMetric, setNlqLlmMeta, t]
  );

  return (
    <div
      className={`w-full px-4 sm:px-5 lg:px-6 border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-06)] ${
        panelExpanded ? "pt-2 pb-1" : "py-1.5"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 min-h-[32px]">
        <CustomTooltip content={panelExpanded ? t("hidePanel") : t("showPanel")} position="bottom">
          <button
            type="button"
            onClick={() => setPanelExpanded((v) => !v)}
            className="board-toolbar-btn gap-1 px-2 -ml-1 shrink-0"
            aria-expanded={panelExpanded}
            aria-label={panelExpanded ? t("hidePanel") : t("showPanel")}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--flux-text)]">{t("label")}</span>
            {hasNlq && !panelExpanded ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--flux-primary-alpha-35)] text-[var(--flux-primary-light)] font-semibold">
                {t("activeBadge")}
              </span>
            ) : null}
            <span
              className={`inline-block text-[10px] text-[var(--flux-text-muted)] transition-transform duration-300 ease-out ${
                panelExpanded ? "rotate-0" : "-rotate-90"
              }`}
              aria-hidden
            >
              ▼
            </span>
          </button>
        </CustomTooltip>
      </div>

      {panelExpanded && (
        <>
          <div className="flex flex-wrap items-end gap-2 mt-2">
            <div className="flex-1 min-w-[min(100%,240px)]">
              <label htmlFor={`nlq-${boardId}`} className="sr-only">
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
              {nlqLlmMeta ? (
                <div className="mt-1.5">
                  <AiModelHint model={nlqLlmMeta.model} provider={nlqLlmMeta.provider} />
                </div>
              ) : null}
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
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-[var(--flux-text-muted)]">{t("filterActive", { count: nlqCardIds.length })}</p>
              {nlqLlmMeta ? <AiModelHint model={nlqLlmMeta.model} provider={nlqLlmMeta.provider} /> : null}
            </div>
          ) : null}
          <p className="text-[10px] text-[var(--flux-text-muted)] mt-1.5 opacity-90">{t("hint")}</p>
        </>
      )}
    </div>
  );
}
