"use client";

import { useMemo } from "react";
import { useBoardStore } from "@/stores/board-store";
import { useFilterStore } from "@/stores/filter-store";

const EMPTY_LABELS: string[] = [];

const PRIORITIES = [
  { key: "all", label: "All" },
  { key: "Crítica", label: "Critical" },
  { key: "Urgente", label: "High" },
  { key: "Média", label: "Medium" },
  { key: "Baixa", label: "Low" },
] as const;

export function BoardPriorityButtons({ boardId }: { boardId: string }) {
  const activePrio = useFilterStore((s) => s.filtersByBoard[boardId]?.activePrio ?? "all");
  const patchFilters = useFilterStore((s) => s.patchFilters);

  return (
    <>
      {PRIORITIES.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => patchFilters(boardId, { activePrio: p.key })}
          className={`shrink-0 h-7 min-w-[72px] rounded-md px-2 text-[11px] font-semibold leading-none transition-colors motion-safe:transition-transform motion-safe:active:scale-[0.96] ${
            activePrio === p.key
              ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]"
              : "bg-[var(--flux-chrome-alpha-06)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-12)] hover:text-[var(--flux-text)]"
          }`}
        >
          {p.label}
        </button>
      ))}
    </>
  );
}

export function BoardFilterBar({ boardId, hidePriorities = false }: { boardId: string; hidePriorities?: boolean }) {
  const activePrio = useFilterStore((s) => s.filtersByBoard[boardId]?.activePrio ?? "all");
  const activeLabelsArr = useFilterStore((s) => s.filtersByBoard[boardId]?.activeLabels ?? EMPTY_LABELS);
  const patchFilters = useFilterStore((s) => s.patchFilters);

  const activeLabels = useMemo(() => new Set(activeLabelsArr), [activeLabelsArr]);

  const cards = useBoardStore((s) => s.db?.cards);
  const allLabels = useMemo(() => {
    if (!cards) return [];
    const set = new Set<string>();
    for (const c of cards) {
      for (const t of c.tags) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const hasActiveFilter = activePrio !== "all" || activeLabels.size > 0;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-1.5 sm:px-5 lg:px-6 border-t border-[var(--flux-border-muted)] flux-glass-surface rounded-none border-x-0 border-b-0 scrollbar-none">
      {!hidePriorities ? <BoardPriorityButtons boardId={boardId} /> : null}

      {!hidePriorities && allLabels.length > 0 && (
        <span className="shrink-0 mx-0.5 h-4 w-px bg-[var(--flux-chrome-alpha-12)]" />
      )}

      {allLabels.map((label) => (
        <button
          key={label}
          type="button"
          onClick={() => {
            const next = new Set(activeLabels);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            patchFilters(boardId, { activeLabels: [...next] });
          }}
          className={`shrink-0 h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
            activeLabels.has(label)
              ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]"
              : "bg-[var(--flux-chrome-alpha-06)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-12)] hover:text-[var(--flux-text)]"
          }`}
        >
          {label}
        </button>
      ))}

      {hasActiveFilter && (
        <>
          <span className="shrink-0 mx-0.5 h-4 w-px bg-[var(--flux-chrome-alpha-12)]" />
          <button
            type="button"
            onClick={() => patchFilters(boardId, { activePrio: "all", activeLabels: [] })}
            className="shrink-0 h-8 rounded-lg px-2.5 text-xs font-semibold bg-[var(--flux-chrome-alpha-06)] text-[var(--flux-danger)] hover:bg-[var(--flux-danger-alpha-12)] transition-colors"
          >
            Clear filters
          </button>
        </>
      )}
    </div>
  );
}
