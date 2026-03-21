"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BucketConfig } from "@/app/board/[id]/page";

type KanbanT = (key: string, values?: Record<string, string | number>) => string;

type KanbanBatchSelectionBarProps = {
  t: KanbanT;
  count: number;
  buckets: BucketConfig[];
  priorities: string[];
  onMoveToBucket: (bucketKey: string) => void;
  onSetPriority: (priority: string) => void;
  onDelete: () => void;
  onClear: () => void;
};

export function KanbanBatchSelectionBar({
  t,
  count,
  buckets,
  priorities,
  onMoveToBucket,
  onSetPriority,
  onDelete,
  onClear,
}: KanbanBatchSelectionBarProps) {
  if (count < 1) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2 mb-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)] shadow-[var(--flux-shadow-kanban-card-lift)]"
      role="toolbar"
      aria-label={t("batchSelection.toolbarAriaLabel")}
    >
      <span className="text-xs font-semibold tabular-nums shrink-0">
        {t("batchSelection.selectedCount", { count })}
      </span>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="btn-secondary text-xs py-1 px-2 h-8">
            {t("batchSelection.moveTo")}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px] max-h-[min(280px,50vh)] overflow-y-auto scrollbar-kanban">
          {buckets.map((b) => (
            <DropdownMenuItem key={b.key} onSelect={() => onMoveToBucket(b.key)}>
              {b.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="btn-secondary text-xs py-1 px-2 h-8">
            {t("batchSelection.changePriority")}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[140px]">
          {priorities.map((p) => (
            <DropdownMenuItem key={p} onSelect={() => onSetPriority(p)}>
              {t(`cardModal.options.priority.${p}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button type="button" className="btn-danger-solid text-xs py-1 px-2 h-8" onClick={onDelete}>
        {t("batchSelection.deleteSelected")}
      </button>

      <button type="button" className="ml-auto text-xs text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] underline-offset-2 hover:underline" onClick={onClear}>
        {t("batchSelection.clearHint")}
      </button>
    </div>
  );
}
