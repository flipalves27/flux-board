"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BoardFilterChips, BoardPriorityButtons } from "@/components/board/board-filter-chips";
import { BoardBacklogPrioritizeDrawer } from "@/components/board/board-backlog-prioritize-drawer";

export { BoardPriorityButtons };

export function BoardFilterBar({
  boardId,
  hidePriorities = false,
  getHeaders,
}: {
  boardId: string;
  hidePriorities?: boolean;
  getHeaders?: () => Record<string, string>;
}) {
  const t = useTranslations("kanban.backlogPrioritize");
  const [backlogOpen, setBacklogOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-1.5 sm:px-5 lg:px-6 border-t border-[var(--flux-border-muted)] flux-glass-surface rounded-none border-x-0 border-b-0 scrollbar-none">
        {getHeaders ? (
          <button
            type="button"
            onClick={() => setBacklogOpen(true)}
            className="shrink-0 rounded-lg border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-18)] transition-colors"
          >
            {t("open")}
          </button>
        ) : null}
        <BoardFilterChips boardId={boardId} hidePriorities={hidePriorities} />
      </div>
      {getHeaders ? (
        <BoardBacklogPrioritizeDrawer
          boardId={boardId}
          open={backlogOpen}
          onClose={() => setBacklogOpen(false)}
          getHeaders={getHeaders}
        />
      ) : null}
    </>
  );
}
