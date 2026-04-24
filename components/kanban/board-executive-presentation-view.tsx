"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import { computeBoardPortfolio } from "@/lib/board-portfolio-metrics";
import { rankTopExecutiveDecisionCards } from "@/lib/executive-decision-rank";
import type { ExecutivePresentationFilter } from "@/stores/ui-store";
import { BoardExecutiveNarratorPanel } from "./board-executive-narrator-panel";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { ExecutiveKpiBento } from "./executive-kpi-bento";
import { ExecutiveProductGoalInline } from "./executive-product-goal-inline";
import {
  clampExecutiveProductGoal,
  EXECUTIVE_PRODUCT_GOAL_MAX,
} from "@/lib/executive-board-config";
import { computeExecutiveFlowMetrics, filterOpenCards } from "@/lib/executive-presentation-metrics";

export type BoardExecutivePresentationViewProps = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  boardName: string;
  productGoal?: string;
  /** Permite editar meta inline (ex.: metodologia com sprint). */
  productGoalEditable?: boolean;
  onSaveProductGoal?: (value: string) => void;
  executiveStakeholderNote?: string;
  onSaveExecutiveStakeholderNote?: (value: string) => void;
  lastUpdated: string;
  buckets: BucketConfig[];
  cards: CardData[];
  filterCard: (c: CardData) => boolean;
  executiveFilter: ExecutivePresentationFilter;
  onExecutiveFilterChange: (f: ExecutivePresentationFilter) => void;
  onOpenCard: (card: CardData) => void;
  /** Recarrega o board a partir do servidor (ex.: após alterações externas). */
  onRefreshBoardData?: () => Promise<void>;
};

function daysUntilDue(due: string | null | undefined): number | null {
  if (!due || typeof due !== "string") return null;
  const d = new Date(`${due.trim()}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function isDone(c: CardData) {
  return c.progress === "Concluída";
}

function priorityChipClass(p: string): string {
  if (p === "Urgente") return "border-[var(--flux-warning)]/45 bg-[var(--flux-warning)]/10 text-[var(--flux-warning-foreground)]";
  if (p === "Importante") return "border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]";
  return "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-08)] text-[var(--flux-text-muted)]";
}

export function BoardExecutivePresentationView({
  boardId,
  getHeaders,
  boardName,
  productGoal,
  productGoalEditable = false,
  onSaveProductGoal,
  executiveStakeholderNote,
  onSaveExecutiveStakeholderNote,
  lastUpdated,
  buckets,
  cards,
  filterCard,
  executiveFilter: filter,
  onExecutiveFilterChange: setFilter,
  onOpenCard,
  onRefreshBoardData,
}: BoardExecutivePresentationViewProps) {
  const t = useTranslations("kanban.board.executivePresentation");
  const tKpi = useTranslations("kanban.board.executivePresentation.kpiBento");
  const tRank = useTranslations("kanban.board.executivePresentation.topDecisions");
  const { pushToast } = useToast();
  const [justifyLoading, setJustifyLoading] = useState(false);
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const portfolio = useMemo(
    () => computeBoardPortfolio({ cards, config: { bucketOrder: buckets }, lastUpdated }),
    [cards, buckets, lastUpdated]
  );

  const visible = useMemo(() => cards.filter(filterCard), [cards, filterCard]);

  const openCards = useMemo(() => visible.filter((c) => !isDone(c)), [visible]);
  const doneCount = useMemo(() => visible.filter(isDone).length, [visible]);

  const attentionIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of openCards) {
      const d = daysUntilDue(c.dueDate);
      if (c.priority === "Urgente" || (d !== null && d < 0)) set.add(c.id);
    }
    return set;
  }, [openCards]);

  const topRanked = useMemo(
    () => rankTopExecutiveDecisionCards(openCards, buckets, { limit: 5 }),
    [openCards, buckets]
  );

  const metrics = useMemo(() => {
    const inProgress = openCards.filter((c) => c.progress === "Em andamento").length;
    const queued = openCards.filter((c) => c.progress === "Não iniciado").length;
    return {
      inProgress,
      queued,
      openTotal: openCards.length,
      attention: attentionIds.size,
    };
  }, [openCards, attentionIds.size]);

  const flowMetrics = useMemo(
    () => computeExecutiveFlowMetrics(buckets, filterOpenCards(cards, filterCard)),
    [buckets, cards, filterCard]
  );

  const filteredOpen = useMemo(() => {
    if (filter === "all") return openCards;
    if (filter === "attention") return openCards.filter((c) => attentionIds.has(c.id));
    return openCards.filter((c) => c.progress === "Em andamento");
  }, [openCards, filter, attentionIds]);

  const cardsByBucket = useMemo(() => {
    const m = new Map<string, CardData[]>();
    for (const b of buckets) m.set(b.key, []);
    for (const c of filteredOpen) {
      const list = m.get(c.bucket);
      if (list) list.push(c);
    }
    return m;
  }, [buckets, filteredOpen]);

  const updatedLabel = useMemo(() => {
    try {
      const d = new Date(lastUpdated);
      if (Number.isNaN(d.getTime())) return lastUpdated;
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return lastUpdated;
    }
  }, [lastUpdated]);

  const topForNarrator = useMemo(
    () =>
      topRanked.map((c) => ({
        title: c.title || c.id,
        bucket: buckets.find((b) => b.key === c.bucket)?.label ?? c.bucket,
        priority: c.priority,
        progress: c.progress,
        justification: justifications[c.id]?.trim() || undefined,
      })),
    [topRanked, buckets, justifications]
  );

  const loadJustifications = async () => {
    if (topRanked.length === 0) return;
    setJustifyLoading(true);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/executive-rank-justify`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: topRanked.map((c) => c.id) }),
      });
      const json = (await res.json()) as { error?: string; justifications?: Record<string, string> };
      if (!res.ok) {
        throw new Error(json.error || "Erro");
      }
      setJustifications(json.justifications ?? {});
      pushToast({ kind: "success", title: tRank("justifyDone") });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : tRank("justifyError");
      pushToast({ kind: "error", title: msg });
    } finally {
      setJustifyLoading(false);
    }
  };

  const handleRefreshBoard = async () => {
    if (!onRefreshBoardData) return;
    setRefreshing(true);
    try {
      await onRefreshBoardData();
      pushToast({ kind: "success", title: t("refreshDone") });
    } catch {
      pushToast({ kind: "error", title: t("refreshError") });
    } finally {
      setRefreshing(false);
    }
  };

  const formatProgressLabel = (p: string) => {
    if (p === "Em andamento") return t("progress.inProgress");
    if (p === "Não iniciado") return t("progress.queued");
    if (p === "Concluída") return t("progress.done");
    return p;
  };

  const formatPriorityLabel = (p: string) => {
    if (p === "Urgente") return t("priority.critical");
    if (p === "Importante") return t("priority.high");
    if (p === "Média") return t("priority.normal");
    return p;
  };

  const duePhrase = (c: CardData) => {
    const d = daysUntilDue(c.dueDate);
    if (d === null) return t("due.none");
    if (d < 0) return t("due.overdue", { days: Math.abs(d) });
    if (d === 0) return t("due.today");
    if (d === 1) return t("due.tomorrow");
    return t("due.inDays", { days: d });
  };

  const renderColumnHeader = (bucket: BucketConfig, list: CardData[]) => {
    const limit = bucket.wipLimit;
    const wipLabel =
      typeof limit === "number" && limit >= 1 ? t("columnWip", { count: list.length, limit }) : String(list.length);
    return (
      <div className="flex items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                background:
                  bucket.color && (bucket.color.startsWith("var(") || bucket.color.startsWith("#"))
                    ? bucket.color
                    : "var(--flux-text-muted)",
              }}
            />
            <h2 className="text-sm font-semibold text-[var(--flux-text)] truncate">{bucket.label}</h2>
            {typeof limit === "number" && list.length > limit ? (
              <span className="rounded-full border border-[var(--flux-warning)]/50 px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-warning-foreground)]">
                {t("wipExceeded")}
              </span>
            ) : null}
          </div>
          {bucket.policy?.trim() ? (
            <p className="text-[11px] text-[var(--flux-text-muted)] mt-0.5 line-clamp-2">{bucket.policy}</p>
          ) : (
            <p className="text-[11px] text-[var(--flux-text-muted)] mt-0.5">{t("defaultStageIntent")}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums ${
            typeof limit === "number" && list.length > limit
              ? "bg-[var(--flux-warning)]/15 text-[var(--flux-warning-foreground)]"
              : "bg-[var(--flux-chrome-alpha-08)] text-[var(--flux-text)]"
          }`}
          title={typeof limit === "number" ? t("columnWipAria", { count: list.length, limit }) : undefined}
        >
          {wipLabel}
        </span>
      </div>
    );
  };

  const renderCardList = (_bucketKey: string, list: CardData[]) => (
    <div className="border-t border-[var(--flux-chrome-alpha-08)] p-2 max-h-[min(44vh,400px)] overflow-y-auto scrollbar-flux">
      {list.length === 0 ? (
        <p className="text-xs text-[var(--flux-text-muted)] px-2 py-3 text-center">{t("emptyColumn")}</p>
      ) : (
        <AnimatePresence mode="popLayout">
          {list.map((c) => {
            const hot = attentionIds.has(c.id);
            const d = daysUntilDue(c.dueDate);
            return (
              <motion.button
                key={c.id}
                layout
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => onOpenCard(c)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 mb-1.5 last:mb-0 transition-colors ${
                  hot
                    ? "border-[var(--flux-warning)]/50 bg-[var(--flux-warning)]/5 hover:bg-[var(--flux-warning)]/10"
                    : "border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] hover:border-[var(--flux-primary-alpha-30)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityChipClass(c.priority)}`}
                  >
                    {formatPriorityLabel(c.priority)}
                  </span>
                </div>
                <div className="text-sm font-medium text-[var(--flux-text)] line-clamp-2">{c.title}</div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--flux-text-muted)]">
                  <span>{formatProgressLabel(c.progress)}</span>
                  <span className={d !== null && d < 0 ? "text-[var(--flux-warning-foreground)] font-medium" : ""}>
                    {duePhrase(c)}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );

  const renderBucketColumn = (bucket: BucketConfig, list: CardData[], layout: "accordion" | "grid") => {
    if (layout === "accordion") {
      const limit = bucket.wipLimit;
      return (
        <details
          key={bucket.key}
          className="group rounded-2xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] overflow-hidden"
        >
          <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background:
                      bucket.color && (bucket.color.startsWith("var(") || bucket.color.startsWith("#"))
                        ? bucket.color
                        : "var(--flux-text-muted)",
                  }}
                />
                <span className="text-sm font-semibold text-[var(--flux-text)] truncate">{bucket.label}</span>
                <span
                  className={`text-xs font-semibold tabular-nums shrink-0 ${
                    typeof limit === "number" && list.length > limit
                      ? "text-[var(--flux-warning-foreground)]"
                      : "text-[var(--flux-text-muted)]"
                  }`}
                >
                  {typeof limit === "number" && limit >= 1
                    ? t("columnWip", { count: list.length, limit })
                    : `(${list.length})`}
                </span>
              </div>
              <span className="text-[10px] font-semibold text-[var(--flux-text-muted)] group-open:hidden">{t("expandStage")}</span>
              <span className="text-[10px] font-semibold text-[var(--flux-primary)] hidden group-open:inline">{t("collapseStage")}</span>
            </div>
          </summary>
          <div className="border-t border-[var(--flux-chrome-alpha-08)]">
            {bucket.policy?.trim() ? (
              <p className="text-[11px] text-[var(--flux-text-muted)] px-4 pt-2 line-clamp-2">{bucket.policy}</p>
            ) : null}
            {renderCardList(bucket.key, list)}
          </div>
        </details>
      );
    }

    return (
      <section
        key={bucket.key}
        className="flex flex-col rounded-2xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] min-h-[100px] overflow-hidden"
      >
        {renderColumnHeader(bucket, list)}
        {renderCardList(bucket.key, list)}
      </section>
    );
  };

  const priorityChips = flowMetrics.priorityCounts.filter((x) => x.count > 0).slice(0, 6);

  return (
    <div className="w-full max-w-[1800px] mx-auto grid grid-cols-1 gap-6 items-start pb-8 px-1 xl:grid-cols-[minmax(0,1fr)_min(420px,100%)]">
      <div className="min-w-0 space-y-5 w-full">
        <header className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-primary)]">{t("kicker")}</p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--flux-text)]">{boardName}</h1>
            <p className="text-sm text-[var(--flux-text-muted)]">{t("subtitle")}</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <p className="text-xs text-[var(--flux-text-muted)] text-right" aria-label={t("aria.updated")}>
              {t("updated", { when: updatedLabel })}
            </p>
            {onRefreshBoardData ? (
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void handleRefreshBoard()}
                className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-3 py-1.5 text-[11px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)] disabled:opacity-45"
              >
                {refreshing ? t("refreshing") : t("refreshData")}
              </button>
            ) : null}
          </div>
        </header>

        {productGoalEditable && onSaveProductGoal ? (
          <ExecutiveProductGoalInline
            value={productGoal ?? ""}
            editable
            maxLength={EXECUTIVE_PRODUCT_GOAL_MAX}
            label={t("productGoalLabel")}
            placeholder={t("productGoalPlaceholder")}
            editCta={t("editContext")}
            saveLabel={t("saveContext")}
            cancelLabel={t("cancelEdit")}
            savedHint={t("contextSaveHint")}
            onSave={(raw) => {
              onSaveProductGoal(clampExecutiveProductGoal(raw));
            }}
          />
        ) : productGoal?.trim() ? (
          <div className="rounded-2xl border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-primary)]">{t("productGoalLabel")}</p>
            <p className="text-sm text-[var(--flux-text)] mt-0.5 leading-relaxed whitespace-pre-wrap">{productGoal.trim()}</p>
          </div>
        ) : null}

        <ExecutiveKpiBento
          portfolio={portfolio}
          flow={flowMetrics}
          attention={metrics.attention}
          inProgress={metrics.inProgress}
          queued={metrics.queued}
          t={tKpi}
        />

        {flowMetrics.overdueOpenCount > 0 ? (
          <p className="text-xs font-medium text-[var(--flux-warning-foreground)]" role="status">
            {t("overdueSummary", { count: flowMetrics.overdueOpenCount })}
          </p>
        ) : null}

        {priorityChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">{t("priorityMixLabel")}</span>
            {priorityChips.map(({ priority, count }) => (
              <span
                key={priority}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${priorityChipClass(priority)}`}
              >
                {formatPriorityLabel(priority)} · {count}
              </span>
            ))}
          </div>
        ) : null}

        <section className="rounded-2xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--flux-text)]">{tRank("title")}</h2>
            <button
              type="button"
              disabled={justifyLoading || topRanked.length === 0}
              onClick={() => void loadJustifications()}
              className="shrink-0 rounded-lg border border-[var(--flux-chrome-alpha-14)] px-3 py-1.5 text-[11px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)] disabled:opacity-45"
            >
              {justifyLoading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-[var(--flux-primary-alpha-40)]" aria-hidden />
                  {tRank("justifyLoading")}
                </span>
              ) : (
                tRank("justifyCta")
              )}
            </button>
          </div>
          <ol className="mt-3 space-y-2">
            {topRanked.length === 0 ? (
              <li className="text-xs text-[var(--flux-text-muted)]">{tRank("empty")}</li>
            ) : (
              topRanked.map((c, idx) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpenCard(c)}
                    className="w-full text-left rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] px-3 py-2.5 hover:border-[var(--flux-primary-alpha-30)]"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] font-bold text-[var(--flux-primary)] tabular-nums shrink-0 pt-0.5">
                        {idx + 1}.
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="text-sm font-semibold text-[var(--flux-text)] line-clamp-2">{c.title}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--flux-text-muted)]">
                          <span>{buckets.find((b) => b.key === c.bucket)?.label ?? c.bucket}</span>
                          <span className="text-[var(--flux-chrome-alpha-20)]">·</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityChipClass(c.priority)}`}
                          >
                            {formatPriorityLabel(c.priority)}
                          </span>
                          <span className="text-[var(--flux-chrome-alpha-20)]">·</span>
                          <span>{duePhrase(c)}</span>
                        </div>
                        {justifications[c.id]?.trim() ? (
                          <p className="text-[11px] text-[var(--flux-text-muted)] leading-snug border-t border-[var(--flux-chrome-alpha-08)] pt-1.5">
                            {justifications[c.id]}
                          </p>
                        ) : justifyLoading ? (
                          <div className="h-8 rounded-md bg-[var(--flux-chrome-alpha-08)] animate-pulse" aria-hidden />
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ol>
        </section>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-[var(--flux-text-muted)] mr-1">{t("filtersLabel")}</span>
          {(
            [
              ["all", t("filter.all")],
              ["attention", t("filter.attention")],
              ["momentum", t("filter.momentum")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === key
                  ? "border-[var(--flux-primary)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                  : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
              }`}
              aria-pressed={filter === key}
            >
              {key === "attention" && metrics.attention > 0 ? (
                <span className="tabular-nums">
                  {label} · {metrics.attention}
                </span>
              ) : (
                label
              )}
            </button>
          ))}
          <span className="text-[11px] text-[var(--flux-text-muted)] ml-auto tabular-nums" aria-live="polite">
            {t("summary", {
              open: metrics.openTotal,
              active: metrics.inProgress,
              queued: metrics.queued,
              done: doneCount,
            })}
          </span>
        </div>

        <div className="lg:hidden space-y-2">
          {buckets.map((bucket) => renderBucketColumn(bucket, cardsByBucket.get(bucket.key) ?? [], "accordion"))}
        </div>

        <div className="hidden lg:grid lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {buckets.map((bucket) => renderBucketColumn(bucket, cardsByBucket.get(bucket.key) ?? [], "grid"))}
        </div>
      </div>

      <BoardExecutiveNarratorPanel
        boardId={boardId}
        getHeaders={getHeaders}
        boardName={boardName}
        productGoal={productGoal}
        executiveStakeholderNote={executiveStakeholderNote}
        onSaveExecutiveStakeholderNote={onSaveExecutiveStakeholderNote}
        lastUpdatedLabel={updatedLabel}
        portfolio={portfolio}
        topDecisions={topForNarrator}
      />
    </div>
  );
}
