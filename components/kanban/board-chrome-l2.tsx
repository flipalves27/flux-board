"use client";

import { useState } from "react";
import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { BoardFilterBar } from "./board-filter-bar";
import { BoardPriorityButtons } from "@/components/board/board-filter-chips";

export type BoardChromeL2Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onda4Enabled: boolean;
  onda4Omnibar: boolean;
  /** NLQ dock expandido já inclui vista + pesquisa — evitar duplicar na L2. */
  nlqExpanded?: boolean;
};

export function BoardChromeL2({
  boardId,
  getHeaders,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  onda4Enabled,
  onda4Omnibar,
  nlqExpanded = false,
}: BoardChromeL2Props) {
  const tPrioritize = useTranslations("kanban.backlogPrioritize");
  const tBoard = useTranslations("kanban.board");
  const [prioritizeOpen, setPrioritizeOpen] = useState(false);
  const hideCompactSearchRow = nlqExpanded && !onda4Omnibar;

  const prioritizeConfig = {
    open: prioritizeOpen,
    onOpenChange: setPrioritizeOpen,
    trigger: hideCompactSearchRow ? ("filterRow" as const) : ("none" as const),
  };

  return (
    <>
      {!hideCompactSearchRow ? (
        <div className="flex min-w-0 flex-col gap-2 border-b border-[var(--flux-chrome-alpha-08)] px-4 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-5 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none sm:min-w-0 sm:flex-[1_1_40%]">
            <BoardPriorityButtons boardId={boardId} />
          </div>
          <div className="flex min-w-0 w-full items-center gap-2 sm:w-auto sm:max-w-[min(100%,28rem)] sm:flex-[1_1_280px] sm:justify-end">
            <button
              type="button"
              onClick={() => setPrioritizeOpen(true)}
              className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-2.5 py-1.5 text-flux-xs font-semibold text-[var(--flux-primary-light)] shadow-sm transition-colors hover:bg-[var(--flux-primary-alpha-18)] hover:border-[var(--flux-primary-alpha-45)]"
            >
              {tPrioritize("open")}
            </button>
            <div className="relative min-w-0 flex-1">
              <span
                className="pointer-events-none absolute left-2 top-1/2 z-[1] -translate-y-1/2 text-[var(--flux-text-muted)] opacity-50 text-flux-xs select-none"
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
                placeholder={tBoard("searchPlaceholder")}
                className="w-full min-w-0 pl-7 pr-2 py-1.5 rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] text-flux-xs bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[var(--flux-primary-alpha-20)] outline-none transition-all duration-200"
              />
            </div>
          </div>
        </div>
      ) : null}

      <BoardFilterBar
        boardId={boardId}
        hidePriorities
        getHeaders={getHeaders}
        prioritize={prioritizeConfig}
      />

      {onda4Enabled && onda4Omnibar ? (
        <div className="border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-1.5 text-flux-xs text-[var(--flux-text-muted)] sm:px-5">
          {tBoard("onda4OmnibarBar")}
        </div>
      ) : null}
    </>
  );
}
