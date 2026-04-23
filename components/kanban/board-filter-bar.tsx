"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BoardFilterChips, BoardPriorityButtons } from "@/components/board/board-filter-chips";
import { BoardBacklogPrioritizeDrawer } from "@/components/board/board-backlog-prioritize-drawer";

export { BoardPriorityButtons };

/** Estado e posição do gatilho «Prioridade IA» quando gerido fora da barra de chips. */
export type BoardFilterBarPrioritizeConfig = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `none`: o botão é renderizado pelo pai; `filterRow`: junto aos chips (ex.: NLQ expandido). */
  trigger: "filterRow" | "none";
};

export function BoardFilterBar({
  boardId,
  hidePriorities = false,
  getHeaders,
  prioritize,
}: {
  boardId: string;
  hidePriorities?: boolean;
  getHeaders?: () => Record<string, string>;
  prioritize?: BoardFilterBarPrioritizeConfig;
}) {
  const t = useTranslations("kanban.backlogPrioritize");
  const [internalOpen, setInternalOpen] = useState(false);

  const hasHeaders = Boolean(getHeaders);
  const open = hasHeaders && prioritize ? prioritize.open : internalOpen;
  const setOpen = hasHeaders && prioritize ? prioritize.onOpenChange : setInternalOpen;
  const showTriggerInFilterRow =
    hasHeaders && (prioritize ? prioritize.trigger === "filterRow" : true);

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 overflow-x-auto border-t border-[var(--flux-border-muted)] flux-glass-surface rounded-none border-x-0 border-b-0 px-4 py-1.5 sm:px-5 lg:px-6 scrollbar-none">
        {showTriggerInFilterRow ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-2.5 py-1 text-flux-xs font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-18)] transition-colors"
          >
            {t("open")}
          </button>
        ) : null}
        <BoardFilterChips boardId={boardId} hidePriorities={hidePriorities} />
      </div>
      {getHeaders ? (
        <BoardBacklogPrioritizeDrawer
          boardId={boardId}
          open={open}
          onClose={() => setOpen(false)}
          getHeaders={getHeaders}
        />
      ) : null}
    </>
  );
}
