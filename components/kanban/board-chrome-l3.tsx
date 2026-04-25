"use client";

import { BoardIntelligenceRow } from "./board-intelligence-row";
import { BoardDailyBriefing } from "./board-daily-briefing";
import { AnomalyToastStack } from "./anomaly-toast-stack";
import { BoardProductGoalStrip } from "./board-product-goal-strip";
import { BoardLssDetailChrome } from "@/components/board-methodology/lean-six-sigma/board-lss-detail-chrome";
import { BoardSafeDetailChrome } from "@/components/board-methodology/safe/board-safe-detail-chrome";
import { useFluxyOmnibarStore } from "@/stores/fluxy-omnibar-store";
import type { FlowInsightChipModel } from "@/lib/board-flow-insights";
import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";
import type { CardData } from "@/app/board/[id]/page";
import type { BucketConfig } from "@/app/board/[id]/page";
import type { MethodologyModule } from "@/lib/methodology-module";
import { isLeanSixSigmaMethodology, isSprintMethodology } from "@/lib/board-methodology";
import type { BoardMethodology } from "@/lib/board-methodology";

export type MatrixWeightFilterKey = "all" | "critical_high" | "high_plus" | "medium_plus" | "critical";

export type BoardChromeL3Props = {
  boardId: string;
  boardName: string;
  getHeaders: () => Record<string, string>;
  methodology: BoardMethodology;
  methodologyModule: MethodologyModule;
  board: { cards: CardData[]; buckets: BucketConfig[]; executionInsights: { inProgress: number } };
  portfolioSnapshot: BoardPortfolioMetrics;
  flowChips: FlowInsightChipModel[];
  insightFocusCardIds: Set<string>;
  setInsightFocusCardIds: (ids: string[]) => void;
  clearInsightFocus: () => void;
  intelligenceExpanded: boolean;
  toggleIntelligenceExpanded: () => void;
  detailChromeExpanded: boolean;
  toggleDetailChromeExpanded: () => void;
  nlqExpanded: boolean;
  activeSprintBoard: { status: string; name: string } | null;
  sprintProgress: { done: number; total: number; pct: number } | null;
  sprintScopeOnly: boolean;
  toggleSprintScopeOnly: () => void;
  matrixWeightFilter: MatrixWeightFilterKey;
  setMatrixWeightFilter: (k: MatrixWeightFilterKey) => void;
  matrixWeightOptions: { key: MatrixWeightFilterKey; label: string }[];
  onOpenFlowHealth: () => void;
  onOpenSprintCoach: () => void;
  onOpenKanbanCadence: () => void;
  onOpenWorkloadBalance: () => void;
  onOpenKnowledgeGraph: () => void;
  onOpenScrumSettings: () => void;
  onOpenIncrementReview: () => void;
  onOpenLssAssist: () => void;
  onOpenSafeAssist: () => void;
  onda4Omnibar: boolean;
  /** L1 already shows sprint badge + scope; hide duplicate strip in L3. */
  sprintRowSuppressedByL1?: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
};

export function BoardChromeL3({
  boardId,
  boardName,
  getHeaders,
  methodology,
  methodologyModule,
  board,
  portfolioSnapshot,
  flowChips,
  insightFocusCardIds,
  setInsightFocusCardIds,
  clearInsightFocus,
  intelligenceExpanded,
  toggleIntelligenceExpanded,
  detailChromeExpanded,
  toggleDetailChromeExpanded,
  nlqExpanded,
  activeSprintBoard,
  sprintProgress,
  sprintScopeOnly,
  toggleSprintScopeOnly,
  matrixWeightFilter,
  setMatrixWeightFilter,
  matrixWeightOptions,
  onOpenFlowHealth,
  onOpenSprintCoach,
  onOpenKanbanCadence,
  onOpenWorkloadBalance,
  onOpenKnowledgeGraph,
  onOpenScrumSettings,
  onOpenIncrementReview,
  onOpenLssAssist,
  onOpenSafeAssist,
  onda4Omnibar,
  sprintRowSuppressedByL1 = false,
  t,
}: BoardChromeL3Props) {
  const activeMatrixWeightFilterLabel =
    matrixWeightOptions.find((o) => o.key === matrixWeightFilter)?.label ?? "";
  const detailCollapseOnMatrixOnly =
    !isSprintMethodology(methodology) && !isLeanSixSigmaMethodology(methodology);

  return (
    <>
      <BoardDailyBriefing boardId={boardId} />
      <AnomalyToastStack boardId={boardId} />

      {intelligenceExpanded ? (
        <div className="relative">
          <BoardIntelligenceRow
            portfolio={portfolioSnapshot}
            chips={flowChips}
            insightFocusActive={insightFocusCardIds.size > 0}
            onInsightChip={(ids) => setInsightFocusCardIds(ids)}
            onClearInsightFocus={clearInsightFocus}
            onOpenFlowHealth={onOpenFlowHealth}
            onOpenSprintCoach={onOpenSprintCoach}
            sprintCoachVisible={isSprintMethodology(methodology) && activeSprintBoard?.status === "active"}
            onOpenCadence={onOpenKanbanCadence}
            cadenceVisible={methodology === "kanban"}
            boardId={boardId}
            getHeaders={getHeaders}
            onOpenWorkloadBalance={onOpenWorkloadBalance}
            onOpenKnowledgeGraph={onOpenKnowledgeGraph}
            onda4Omnibar={onda4Omnibar}
            onAskFluxy={() => {
              const seed = t("board.fluxyOmnibarSeed", { name: boardName });
              useFluxyOmnibarStore.getState().setPendingSeed(seed);
              window.dispatchEvent(new CustomEvent("flux-open-fluxy-omnibar", { detail: { seed } }));
            }}
          />
          <button
            type="button"
            onClick={toggleIntelligenceExpanded}
            className="absolute right-3 top-1.5 rounded-md p-1 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
            aria-label={t("board.intelligenceCollapse.collapse")}
            aria-expanded
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-1 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={toggleIntelligenceExpanded}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-flux-xs font-semibold text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
            aria-expanded={false}
            aria-label={t("board.intelligenceCollapse.expand")}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
            <span>{t("board.intelligenceCollapse.label")}</span>
          </button>
          <span className="text-flux-xs tabular-nums text-[var(--flux-text-muted)]">
            {t("board.intelligence.compactWip", { n: board.executionInsights.inProgress })}
          </span>
          {flowChips.find((c) => c.kind === "blocked") ? (
            <span className="text-flux-xs tabular-nums text-[var(--flux-warning,#f59e0b)]">
              {t("board.intelligence.compactBlocked", {
                n: flowChips.find((c) => c.kind === "blocked")?.values?.count ?? 0,
              })}
            </span>
          ) : null}
          {portfolioSnapshot.risco !== null ? (
            <span className="text-flux-xs tabular-nums text-[var(--flux-text-muted)]">
              {t("board.intelligence.riskShort", { n: portfolioSnapshot.risco })}
            </span>
          ) : null}
        </div>
      )}

      {!detailChromeExpanded ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-1 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={toggleDetailChromeExpanded}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-flux-xs font-semibold text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
            aria-expanded={false}
            aria-label={t("board.detailChrome.expandAria")}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
            <span>{t("board.detailChrome.expand")}</span>
          </button>
          {matrixWeightFilter !== "all" ? (
            <span
              className="max-w-[min(100%,220px)] truncate rounded-full border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] px-2 py-0.5 text-flux-xs font-semibold text-[var(--flux-primary-light)]"
              title={activeMatrixWeightFilterLabel}
            >
              {t("board.detailChrome.activeMatrixBadge", { filter: activeMatrixWeightFilterLabel })}
            </span>
          ) : null}
        </div>
      ) : (
        <>
          {methodologyModule.detailChromeStrip === "scrum_product_goal" ? (
            <div className="relative">
              <button
                type="button"
                onClick={toggleDetailChromeExpanded}
                className="absolute left-2 top-2 z-[1] rounded-md p-1 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
                aria-label={t("board.detailChrome.collapse")}
                aria-expanded
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>
              <BoardProductGoalStrip
                boardId={boardId}
                getHeaders={getHeaders}
                onOpenScrumSettings={onOpenScrumSettings}
                onOpenIncrementReview={onOpenIncrementReview}
                className="pl-10 sm:pl-11"
              />
            </div>
          ) : null}

          {methodologyModule.detailChromeStrip === "lss_context" ? (
            <BoardLssDetailChrome
              buckets={board.buckets}
              cards={board.cards}
              onOpenAssist={onOpenLssAssist}
              onCollapseDetailChrome={toggleDetailChromeExpanded}
            />
          ) : null}

          {methodologyModule.detailChromeStrip === "safe_context" ? (
            <BoardSafeDetailChrome
              buckets={board.buckets}
              cards={board.cards}
              onOpenAssist={onOpenSafeAssist}
              onCollapseDetailChrome={toggleDetailChromeExpanded}
            />
          ) : null}

          {nlqExpanded &&
          isSprintMethodology(methodology) &&
          activeSprintBoard?.status === "active" &&
          !sprintRowSuppressedByL1 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-2 sm:px-5 lg:px-6">
              {sprintProgress && sprintProgress.total > 0 ? (
                <div
                  className="relative h-9 w-9 shrink-0"
                  title={t("board.filters.sprintProgress", { done: sprintProgress.done, total: sprintProgress.total })}
                >
                  <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--flux-chrome-alpha-12)" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke={sprintProgress.pct === 100 ? "var(--flux-success)" : "var(--flux-primary)"}
                      strokeWidth="3"
                      strokeDasharray={`${(sprintProgress.pct / 100) * 97.4} 97.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-[var(--flux-text-muted)]">
                    {sprintProgress.pct}%
                  </span>
                </div>
              ) : null}
              <span className="text-flux-sm font-semibold text-[var(--flux-text-muted)] truncate max-w-[min(100%,220px)]">
                {activeSprintBoard.name}
              </span>
              <button
                type="button"
                onClick={toggleSprintScopeOnly}
                className={`rounded-lg border px-2.5 py-1 text-flux-xs font-semibold transition-colors ${
                  sprintScopeOnly
                    ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                    : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
                }`}
              >
                {sprintScopeOnly ? t("board.filters.sprintAll") : t("board.filters.sprintOnly")}
              </button>
              <span className="text-flux-xs text-[var(--flux-text-muted)] hidden sm:inline">{t("board.filters.sprintFilterHint")}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-2 sm:px-5 lg:px-6">
            {detailCollapseOnMatrixOnly ? (
              <button
                type="button"
                onClick={toggleDetailChromeExpanded}
                className="shrink-0 rounded-md p-1 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
                aria-label={t("board.detailChrome.collapse")}
                aria-expanded
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>
            ) : null}
            <span className="text-flux-sm font-semibold text-[var(--flux-text-muted)]">{t("board.filters.matrixWeightLabel")}</span>
            {matrixWeightOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMatrixWeightFilter(opt.key)}
                className={`rounded-lg border px-2.5 py-1 text-flux-xs font-semibold transition-colors ${
                  matrixWeightFilter === opt.key
                    ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                    : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
