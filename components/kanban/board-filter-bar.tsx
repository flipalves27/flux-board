"use client";

import { BoardFilterChips, BoardPriorityButtons } from "@/components/board/board-filter-chips";

export { BoardPriorityButtons };

export function BoardFilterBar({ boardId, hidePriorities = false }: { boardId: string; hidePriorities?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-1.5 sm:px-5 lg:px-6 border-t border-[var(--flux-border-muted)] flux-glass-surface rounded-none border-x-0 border-b-0 scrollbar-none">
      <BoardFilterChips boardId={boardId} hidePriorities={hidePriorities} />
    </div>
  );
}
