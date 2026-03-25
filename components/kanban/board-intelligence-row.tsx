"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { FlowInsightChipModel } from "@/lib/board-flow-insights";
import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";
import { BoardMetricsStrip } from "@/components/kanban/board-metrics-strip";
import { BoardHealthScoreWidget } from "@/components/kanban/board-health-score-widget";

type ExecutionInsights = {
  inProgress: number;
  doneRate: number;
  overdue: number;
  dueSoon: number;
};

export type BoardIntelligenceRowProps = {
  tKanban: (key: string, values?: Record<string, string | number>) => string;
  totalCards: number;
  executionInsights: ExecutionInsights;
  portfolio: BoardPortfolioMetrics;
  chips: FlowInsightChipModel[];
  insightFocusActive: boolean;
  onInsightChip: (cardIds: string[]) => void;
  onClearInsightFocus: () => void;
  onOpenFlowHealth: () => void;
  onOpenSprintCoach: () => void;
  sprintCoachVisible: boolean;
  onOpenCadence?: () => void;
  cadenceVisible?: boolean;
  boardId?: string;
  getHeaders?: () => Record<string, string>;
  onOpenWorkloadBalance?: () => void;
  onOpenKnowledgeGraph?: () => void;
};

function chipLabel(
  t: ReturnType<typeof useTranslations>,
  chip: FlowInsightChipModel
): string {
  const v = chip.values ?? {};
  switch (chip.kind) {
    case "wip":
      return t("board.intelligence.chips.wip", {
        columns: Number(v.columns ?? 0),
        cards: Number(v.cards ?? 0),
      });
    case "blocked":
      return t("board.intelligence.chips.blocked", { count: Number(v.count ?? 0) });
    case "stagnant":
      return t("board.intelligence.chips.stagnant", {
        count: Number(v.count ?? 0),
        days: Number(v.days ?? 5),
      });
    case "overdue":
      return t("board.intelligence.chips.overdue", { count: Number(v.count ?? 0) });
    case "risk":
      return t("board.intelligence.chips.risk", { score: Number(v.score ?? 0) });
    case "portfolio":
      return t("board.intelligence.chips.flow", { score: Number(v.score ?? 0) });
    default:
      return chip.id;
  }
}

export function BoardIntelligenceRow({
  tKanban,
  totalCards,
  executionInsights,
  portfolio,
  chips,
  insightFocusActive,
  onInsightChip,
  onClearInsightFocus,
  onOpenFlowHealth,
  onOpenSprintCoach,
  sprintCoachVisible,
  onOpenCadence,
  cadenceVisible,
  boardId,
  getHeaders,
  onOpenWorkloadBalance,
  onOpenKnowledgeGraph,
}: BoardIntelligenceRowProps) {
  const t = useTranslations("kanban");
  const [metricsOpen, setMetricsOpen] = useState(false);

  return (
    <div className="flex flex-col border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)]">
      <div className="px-4 sm:px-5 lg:px-6 py-1.5 border-t border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-06)]">
        <button
          type="button"
          onClick={() => setMetricsOpen((v) => !v)}
          className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-2.5 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
          aria-expanded={metricsOpen}
        >
          {metricsOpen ? "Ocultar totalizadores" : "Mostrar totalizadores"}
        </button>
      </div>
      {metricsOpen ? <BoardMetricsStrip t={tKanban} totalCards={totalCards} executionInsights={executionInsights} /> : null}
      <div
        className="flex flex-wrap items-center gap-2 px-4 sm:px-5 lg:px-6 py-2 border-t border-[var(--flux-border-muted)]"
        data-tour="board-intelligence"
      >
        {boardId && getHeaders && (
          <BoardHealthScoreWidget boardId={boardId} getHeaders={getHeaders} />
        )}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
          {portfolio.risco !== null && (
            <span className="text-[10px] tabular-nums text-[var(--flux-text-muted)] shrink-0">
              {t("board.intelligence.riskShort", { n: portfolio.risco })}
            </span>
          )}
          {portfolio.throughput !== null && (
            <span className="text-[10px] tabular-nums text-[var(--flux-text-muted)] shrink-0">
              {t("board.intelligence.flowShort", { n: portfolio.throughput })}
            </span>
          )}
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                if (!chip.cardIds.length && (chip.kind === "risk" || chip.kind === "portfolio")) {
                  onOpenFlowHealth();
                  return;
                }
                onInsightChip(chip.cardIds);
              }}
              className="rounded-full border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-surface-mid)] px-2.5 py-1 text-[10px] font-semibold text-[var(--flux-text)] hover:border-[var(--flux-primary-alpha-45)] hover:bg-[var(--flux-primary-alpha-08)] transition-colors max-w-[min(100%,280px)] truncate"
            >
              {chipLabel(t, chip)}
            </button>
          ))}
          {insightFocusActive ? (
            <button
              type="button"
              onClick={onClearInsightFocus}
              className="text-[10px] font-semibold text-[var(--flux-primary-light)] hover:underline"
            >
              {t("board.intelligence.clearFocus")}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenFlowHealth}
            className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-2.5 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
          >
            {t("board.intelligence.openFlowHealth")}
          </button>
          {sprintCoachVisible ? (
            <button
              type="button"
              onClick={onOpenSprintCoach}
              className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-2.5 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
            >
              {t("board.intelligence.sprintCoach")}
            </button>
          ) : null}
          {cadenceVisible && onOpenCadence ? (
            <button
              type="button"
              onClick={onOpenCadence}
              className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-2.5 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
            >
              {t("board.intelligence.cadence")}
            </button>
          ) : null}
          {onOpenWorkloadBalance ? (
            <button
              type="button"
              onClick={onOpenWorkloadBalance}
              className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-2.5 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
            >
              {t("board.intelligence.workloadBalance")}
            </button>
          ) : null}
          {onOpenKnowledgeGraph ? (
            <button
              type="button"
              onClick={onOpenKnowledgeGraph}
              className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-2.5 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
            >
              {t("board.knowledgeGraph.open")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
