"use client";

import type { RefObject } from "react";
import { BoardNlqDock } from "./board-nlq-dock";
import { BoardViewModeSegment } from "./board-view-mode-segment";
import { BoardAutomationSuggestions } from "./board-automation-suggestions";
import type { BoardViewMode } from "./kanban-constants";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";
import { Maximize2, SlidersHorizontal } from "lucide-react";

export type BoardChromeL1Props = {
  boardId: string;
  boardName: string;
  cards: CardData[];
  buckets: BucketConfig[];
  nlqExpanded: boolean;
  setNlqExpanded: (v: boolean) => void;
  onda4Omnibar: boolean;
  getHeaders: () => Record<string, string>;
  boardView: BoardViewMode;
  setBoardView: (v: BoardViewMode) => void;
  allowedViewModes: readonly BoardViewMode[];
  showSprintInlineBadge: boolean;
  activeSprintName: string | null;
  sprintProgress: { done: number; total: number; pct: number } | null;
  sprintScopeOnly: boolean;
  toggleSprintScopeOnly: () => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  t: (key: string, values?: Record<string, string | number>) => string;
  tTimeline: (k: string) => string;
  /** Abre o novo modal unificado de filtros. */
  onOpenFilterModal?: () => void;
  /** Modo foco: esconde cromado (atalho global em hotkeys). */
  onEnterFocusMode?: () => void;
};

export function BoardChromeL1({
  boardId,
  boardName,
  cards,
  buckets,
  nlqExpanded,
  setNlqExpanded,
  onda4Omnibar,
  getHeaders,
  boardView,
  setBoardView,
  allowedViewModes,
  showSprintInlineBadge,
  activeSprintName,
  sprintProgress,
  sprintScopeOnly,
  toggleSprintScopeOnly,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  t,
  tTimeline,
  onOpenFilterModal,
  onEnterFocusMode,
}: BoardChromeL1Props) {
  void boardName;

  return (
    <>
      <BoardAutomationSuggestions variant="topStrip" boardId={boardId} cards={cards} buckets={buckets} />
      {nlqExpanded && !onda4Omnibar ? (
        <div className="relative">
          <BoardNlqDock
            boardId={boardId}
            getHeaders={getHeaders}
            boardView={boardView}
            setBoardView={setBoardView}
            allowedViewModes={allowedViewModes}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchInputRef={searchInputRef}
          />
          <button
            type="button"
            onClick={() => setNlqExpanded(false)}
            className="absolute right-3 top-2 rounded-md p-1 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
            aria-label={t("board.nlqCompact.collapse")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden border-b border-[var(--flux-chrome-alpha-08)] flux-glass-surface rounded-none border-x-0 border-t-0 px-4 py-1.5 scrollbar-flux touch-pan-x sm:px-5 lg:px-6">
          <BoardViewModeSegment
            boardView={boardView}
            setBoardView={setBoardView}
            allowedViewModes={allowedViewModes}
            tTimeline={tTimeline}
            variant="keys"
            groupAriaLabel={t("board.timeline.toggleGroupAria")}
          />

          {showSprintInlineBadge && sprintProgress && activeSprintName ? (
            <button
              type="button"
              onClick={toggleSprintScopeOnly}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-flux-xs font-semibold transition-colors shrink-0 ${
                sprintScopeOnly
                  ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                  : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
              }`}
              title={
                sprintProgress.total === 0
                  ? t("board.sprintContext.l1BadgeTitleEmpty")
                  : t("board.filters.sprintProgress", { done: sprintProgress.done, total: sprintProgress.total })
              }
            >
              <svg viewBox="0 0 36 36" className="h-5 w-5 -rotate-90 shrink-0" aria-hidden>
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--flux-chrome-alpha-12)" strokeWidth="3.5" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke={sprintProgress.pct === 100 ? "var(--flux-success)" : "var(--flux-primary)"}
                  strokeWidth="3.5"
                  strokeDasharray={`${(sprintProgress.pct / 100) * 97.4} 97.4`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="tabular-nums">{sprintProgress.pct}%</span>
              <span className="truncate max-w-[100px] hidden sm:inline">{activeSprintName}</span>
            </button>
          ) : null}

          {onOpenFilterModal || !onda4Omnibar || onEnterFocusMode ? (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {onEnterFocusMode ? (
                <button
                  type="button"
                  onClick={onEnterFocusMode}
                  className="rounded-lg border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-surface-elevated)] p-1.5 text-[var(--flux-text-muted)] shadow-sm transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-08)]"
                  aria-label={t("board.chrome.focusMode")}
                  title={t("board.chrome.focusModeTitle")}
                >
                  <Maximize2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              {onOpenFilterModal ? (
                <button
                  type="button"
                  onClick={onOpenFilterModal}
                  aria-label={t("board.filterModal.open")}
                  title={t("board.filterModal.open")}
                  className="rounded-lg border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-surface-elevated)] p-1.5 text-[var(--flux-text-muted)] shadow-sm transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-08)]"
                >
                  <SlidersHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              {!onda4Omnibar ? (
                <button
                  type="button"
                  onClick={() => setNlqExpanded(true)}
                  className="rounded-md border border-[var(--flux-chrome-alpha-12)] p-1.5 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:border-[var(--flux-primary-alpha-35)] transition-colors"
                  aria-label={t("board.nlqCompact.expand")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
