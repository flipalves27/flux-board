"use client";

import { useTranslations } from "next-intl";
import { Activity, CalendarClock, ChevronDown, Network, Sparkles } from "lucide-react";
import type { FlowInsightChipModel } from "@/lib/board-flow-insights";
import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";
import { BoardHealthScoreWidget } from "@/components/kanban/board-health-score-widget";
import { BoardHealthBriefingButton } from "@/components/kanban/board-health-briefing-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type BoardIntelligenceRowProps = {
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
  /** Onda 4: abre Omnibar com contexto do board. */
  onda4Omnibar?: boolean;
  onAskFluxy?: () => void;
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

const triggerBtnClass =
  "inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-surface-mid)] px-2 text-[10px] font-semibold text-[var(--flux-text-muted)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)] data-[state=open]:border-[var(--flux-primary-alpha-45)] data-[state=open]:text-[var(--flux-text)]";

export function BoardIntelligenceRow({
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
  onda4Omnibar,
  onAskFluxy,
}: BoardIntelligenceRowProps) {
  const t = useTranslations("kanban");

  const hasRitualItems =
    Boolean(sprintCoachVisible) || (Boolean(cadenceVisible) && typeof onOpenCadence === "function");
  const hasFlowExtras = Boolean(onOpenWorkloadBalance);
  const showRitualsMenu = hasRitualItems;
  const showGraphsMenu = Boolean(onOpenKnowledgeGraph);

  return (
    <div className="flex flex-col border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)]">
      <div
        className="flex flex-wrap items-center gap-2 px-4 sm:px-5 lg:px-6 py-2 border-t border-[var(--flux-border-muted)]"
        data-tour="board-intelligence"
      >
        {boardId && getHeaders && (
          <>
            <BoardHealthScoreWidget boardId={boardId} getHeaders={getHeaders} />
            <BoardHealthBriefingButton boardId={boardId} getHeaders={getHeaders} />
          </>
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
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" className={triggerBtnClass} aria-label={t("board.intelligence.groups.flowMenuAria")}>
                <Activity className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                <span>{t("board.intelligence.groups.flow")}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem onSelect={() => onOpenFlowHealth()} className="cursor-pointer">
                {t("board.intelligence.openFlowHealth")}
              </DropdownMenuItem>
              {hasFlowExtras && onOpenWorkloadBalance ? (
                <DropdownMenuItem onSelect={() => onOpenWorkloadBalance()} className="cursor-pointer">
                  {t("board.intelligence.workloadBalance")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          {showRitualsMenu ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button type="button" className={triggerBtnClass} aria-label={t("board.intelligence.groups.ritualsMenuAria")}>
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  <span>{t("board.intelligence.groups.rituals")}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {sprintCoachVisible ? (
                  <DropdownMenuItem onSelect={() => onOpenSprintCoach()} className="cursor-pointer">
                    {t("board.intelligence.sprintCoach")}
                  </DropdownMenuItem>
                ) : null}
                {cadenceVisible && onOpenCadence ? (
                  <DropdownMenuItem onSelect={() => onOpenCadence()} className="cursor-pointer">
                    {t("board.intelligence.cadence")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {showGraphsMenu ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button type="button" className={triggerBtnClass} aria-label={t("board.intelligence.groups.graphsMenuAria")}>
                  <Network className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  <span>{t("board.intelligence.groups.graphs")}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {onOpenKnowledgeGraph ? (
                  <DropdownMenuItem onSelect={() => onOpenKnowledgeGraph()} className="cursor-pointer">
                    {t("board.knowledgeGraph.open")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {onda4Omnibar && onAskFluxy ? (
            <button
              type="button"
              onClick={onAskFluxy}
              title={t("board.intelligence.askFluxyTitle")}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] px-2 text-[10px] font-semibold text-[var(--flux-primary-light)] transition-colors hover:border-[var(--flux-primary)]"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              {t("board.intelligence.askFluxy")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
