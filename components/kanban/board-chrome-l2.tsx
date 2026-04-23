"use client";

import type { RefObject } from "react";
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
  const hideCompactSearchRow = nlqExpanded && !onda4Omnibar;

  return (
    <>
      {!hideCompactSearchRow ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--flux-chrome-alpha-08)] px-4 py-1.5 sm:px-5 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none sm:flex-initial">
            <BoardPriorityButtons boardId={boardId} />
          </div>
          <div className="relative min-w-0 w-full shrink-0 sm:w-[min(100%,200px)] sm:max-w-[220px]">
            <span
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--flux-text-muted)] opacity-50 text-flux-xs select-none"
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
              className="w-full pl-7 pr-2 py-1 rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] text-flux-xs bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[var(--flux-primary-alpha-20)] outline-none transition-all duration-200"
            />
          </div>
        </div>
      ) : null}

      <BoardFilterBar boardId={boardId} hidePriorities getHeaders={getHeaders} />

      {onda4Enabled && onda4Omnibar ? (
        <div className="border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-1.5 text-flux-xs text-[var(--flux-text-muted)] sm:px-5">
          Onda 4: NLQ compacto foi integrado à Omnibar Fluxy (⌘K ou /). Painéis de fluxo, cadência e carga continuam pelos atalhos do board.
        </div>
      ) : null}
    </>
  );
}
