"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBoardNlqUiStore, type BoardNlqMetricSnapshot } from "@/stores/board-nlq-ui-store";
import { useToast } from "@/context/toast-context";
import { AiModelHint } from "@/components/ai-model-hint";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import type { BoardViewMode } from "./kanban-constants";

function IconKanban({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
    </svg>
  );
}

function IconTable({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconTimeline({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path d="M4 7h5v4H4V7zm7 0h9v4h-9V7zM4 14h8v4H4v-4zm10 0h6v4h-6v-4z" />
    </svg>
  );
}

function IconEisenhower({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path d="M3 3h18v18H3V3zm8 1v16h2V4h-2zM4 11v2h16v-2H4z" />
    </svg>
  );
}

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
  onExpandFilters?: () => void;
  boardView: BoardViewMode;
  setBoardView: (v: BoardViewMode) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
};

const nlqExpandedStorageKey = (boardId: string) => `flux-board.nlqDock.expanded.${boardId}`;

export function BoardNlqDock({ boardId, getHeaders, onExpandFilters, boardView, setBoardView, searchQuery, setSearchQuery, searchInputRef }: BoardNlqDockProps) {
  const t = useTranslations("kanban.board.nlq");
  const tTimeline = useTranslations("kanban.board.timeline");
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

  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;
  const onExpandFiltersRef = useRef(onExpandFilters);
  onExpandFiltersRef.current = onExpandFilters;

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/nlq`, { headers: getHeadersRef.current() });
      const data = (await res.json().catch(() => ({}))) as { recent?: string[] };
      if (res.ok && Array.isArray(data.recent)) setRecent(data.recent);
    } catch {
      // ignore
    }
  }, [boardId]);

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
          headers: { "Content-Type": "application/json", ...getHeadersRef.current() },
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
          onExpandFiltersRef.current?.();
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
    [boardId, loadRecent, pushToast, setBoardNlqCards, setBoardNlqMetric, setNlqLlmMeta, t]
  );

  return (
    <div
      className={`w-full px-4 sm:px-5 lg:px-6 border-b border-[var(--flux-chrome-alpha-08)] flux-glass-surface rounded-none border-x-0 border-t-0 ${
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

        <div
          className="board-segment flex items-center gap-0.5 p-1 shrink-0 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-08)]"
          role="group"
          aria-label={tTimeline("toggleGroupAria")}
        >
          <CustomTooltip content={tTimeline("viewKanbanTooltip")} position="bottom">
            <button
              type="button"
              onClick={() => setBoardView("kanban")}
              className={`px-2.5 py-2 rounded-md transition-all duration-200 flex items-center justify-center ${
                boardView === "kanban"
                  ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }`}
              aria-pressed={boardView === "kanban"}
              aria-label={tTimeline("viewKanbanAria")}
            >
              <IconKanban active={boardView === "kanban"} />
            </button>
          </CustomTooltip>
          <CustomTooltip content={tTimeline("viewTableTooltip")} position="bottom">
            <button
              type="button"
              onClick={() => setBoardView("table")}
              className={`px-2.5 py-2 rounded-md transition-all duration-200 flex items-center justify-center ${
                boardView === "table"
                  ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }`}
              aria-pressed={boardView === "table"}
              aria-label={tTimeline("viewTableAria")}
            >
              <IconTable active={boardView === "table"} />
            </button>
          </CustomTooltip>
          <CustomTooltip content={tTimeline("viewTimelineTooltip")} position="bottom">
            <button
              type="button"
              onClick={() => setBoardView("timeline")}
              className={`px-2.5 py-2 rounded-md transition-all duration-200 flex items-center justify-center ${
                boardView === "timeline"
                  ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }`}
              aria-pressed={boardView === "timeline"}
              aria-label={tTimeline("viewTimelineAria")}
            >
              <IconTimeline active={boardView === "timeline"} />
            </button>
          </CustomTooltip>
          <CustomTooltip content={tTimeline("viewEisenhowerTooltip")} position="bottom">
            <button
              type="button"
              onClick={() => setBoardView("eisenhower")}
              className={`px-2.5 py-2 rounded-md transition-all duration-200 flex items-center justify-center ${
                boardView === "eisenhower"
                  ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }`}
              aria-pressed={boardView === "eisenhower"}
              aria-label={tTimeline("viewEisenhowerAria")}
            >
              <IconEisenhower active={boardView === "eisenhower"} />
            </button>
          </CustomTooltip>
        </div>

        <div className="relative ml-auto shrink-0 w-[min(100%,220px)] sm:w-[240px]">
          <span
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--flux-text-muted)] opacity-50 text-sm select-none"
            aria-hidden
          >
            ⌕
          </span>
          <input
            ref={searchInputRef}
            data-flux-board-search
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar…"
            className="w-full pl-8 pr-2 py-1.5 rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] text-xs bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[var(--flux-primary-alpha-20)] outline-none transition-all duration-200"
          />
        </div>
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
                  {/* debounce evita loop de resize (React #185) com ResizeObserver + flex */}
                  <ResponsiveContainer width="100%" height="100%" debounce={200}>
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
