"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import { computeBoardPortfolio } from "@/lib/board-portfolio-metrics";

type ExecutiveFilter = "all" | "attention" | "momentum";

export type BoardExecutivePresentationViewProps = {
  boardName: string;
  productGoal?: string;
  lastUpdated: string;
  buckets: BucketConfig[];
  cards: CardData[];
  filterCard: (c: CardData) => boolean;
  onOpenCard: (card: CardData) => void;
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

export function BoardExecutivePresentationView({
  boardName,
  productGoal,
  lastUpdated,
  buckets,
  cards,
  filterCard,
  onOpenCard,
}: BoardExecutivePresentationViewProps) {
  const t = useTranslations("kanban.board.executivePresentation");
  const [filter, setFilter] = useState<ExecutiveFilter>("all");

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

  const kpi = (value: number | null, label: string, hint: string) => (
    <div className="flex flex-1 min-w-[140px] flex-col gap-1 rounded-2xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-[var(--flux-text)]">{value == null ? "—" : `${value}`}</span>
      <span className="text-[10px] text-[var(--flux-text-muted)] leading-snug">{hint}</span>
    </div>
  );

  const updatedLabel = useMemo(() => {
    try {
      const d = new Date(lastUpdated);
      if (Number.isNaN(d.getTime())) return lastUpdated;
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return lastUpdated;
    }
  }, [lastUpdated]);

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-8">
      <header className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-primary)]">{t("kicker")}</p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--flux-text)]">{boardName}</h1>
            <p className="text-sm text-[var(--flux-text-muted)] mt-1">{t("subtitle")}</p>
          </div>
          <p className="text-xs text-[var(--flux-text-muted)] shrink-0" aria-label={t("aria.updated")}>
            {t("updated", { when: updatedLabel })}
          </p>
        </div>
        {productGoal?.trim() ? (
          <div className="rounded-2xl border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-primary)]">{t("productGoalLabel")}</p>
            <p className="text-sm text-[var(--flux-text)] mt-0.5 leading-relaxed">{productGoal.trim()}</p>
          </div>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        {kpi(portfolio.risco, t("kpi.resilience"), t("kpi.resilienceHint"))}
        {kpi(portfolio.throughput, t("kpi.momentum"), t("kpi.momentumHint"))}
        {kpi(portfolio.previsibilidade, t("kpi.predictability"), t("kpi.predictabilityHint"))}
      </div>

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
              <span className="tabular-nums">{label} · {metrics.attention}</span>
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

      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
        {buckets.map((bucket) => {
          const list = cardsByBucket.get(bucket.key) ?? [];
          return (
            <section
              key={bucket.key}
              className="flex flex-col rounded-2xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] min-h-[100px] overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
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
                  </div>
                  {bucket.policy?.trim() ? (
                    <p className="text-[11px] text-[var(--flux-text-muted)] mt-0.5 line-clamp-2">{bucket.policy}</p>
                  ) : (
                    <p className="text-[11px] text-[var(--flux-text-muted)] mt-0.5">{t("defaultStageIntent")}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-lg bg-[var(--flux-chrome-alpha-08)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--flux-text)]">
                  {list.length}
                </span>
              </div>

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
                          <div className="text-sm font-medium text-[var(--flux-text)] line-clamp-2">{c.title}</div>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--flux-text-muted)]">
                            <span>{formatProgressLabel(c.progress)}</span>
                            <span>{formatPriorityLabel(c.priority)}</span>
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
            </section>
          );
        })}
      </div>
    </div>
  );
}
