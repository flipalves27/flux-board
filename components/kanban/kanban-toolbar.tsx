"use client";

import type { Dispatch, SetStateAction } from "react";

type KanbanToolbarProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  priorityBarVisible: boolean;
  priorities: string[];
  activePrio: string;
  setActivePrio: Dispatch<SetStateAction<string>>;
  focusMode: boolean;
  setFocusMode: Dispatch<SetStateAction<boolean>>;
  clearFilters: () => void;
  applyFocusMode: () => void;
  labelsOpen: boolean;
  setLabelsOpen: Dispatch<SetStateAction<boolean>>;
  onOpenMapa: () => void;
  onOpenDaily: () => void;
  boardLabels: string[];
  activeLabels: Set<string>;
  onToggleLabel: (label: string) => void;
};

export function KanbanToolbar({
  t,
  priorityBarVisible,
  priorities,
  activePrio,
  setActivePrio,
  focusMode,
  setFocusMode,
  clearFilters,
  applyFocusMode,
  labelsOpen,
  setLabelsOpen,
  onOpenMapa,
  onOpenDaily,
  boardLabels,
  activeLabels,
  onToggleLabel,
}: KanbanToolbarProps) {
  if (!priorityBarVisible) return null;

  return (
    <>
      <div className="border-t border-[var(--flux-border-muted)] px-4 sm:px-5 lg:px-6 py-2.5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 md:items-stretch">
          <div className="board-toolbar-group p-2 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)] mb-1.5">
              {t("board.filters.priorityLabel")}
            </div>
            <div className="flex flex-nowrap items-center gap-1 overflow-x-auto scrollbar-flux pb-0.5">
              {["all", ...priorities].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActivePrio(p)}
                  className={`btn-pill-compact text-[11px] leading-tight px-1.5 py-0.5 whitespace-nowrap transition-all duration-200 shrink-0 ${
                    activePrio === p
                      ? "bg-[var(--flux-primary)] text-white border-[var(--flux-primary)] shadow-[var(--flux-shadow-primary-soft)]"
                      : "bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] border-[var(--flux-control-border)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-glow)]"
                  }`}
                >
                  {p === "all" ? t("board.filters.allLabel") : t(`cardModal.options.priority.${p}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="board-toolbar-group p-2 min-w-0 flex flex-col">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)] mb-1.5">
              {t("board.toolbar.sectionQuickActions")}
            </div>
            <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto scrollbar-flux pb-0.5 -mx-0.5 px-0.5 min-h-[28px]">
              <button
                type="button"
                onClick={() => {
                  if (focusMode) clearFilters();
                  else {
                    applyFocusMode();
                    setFocusMode(true);
                  }
                }}
                className={
                  focusMode
                    ? "inline-flex shrink-0 items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold font-display transition-all duration-200 border border-[var(--flux-secondary)] bg-[var(--flux-secondary-alpha-14)] text-[var(--flux-secondary)] shadow-[var(--flux-shadow-secondary-outline)] whitespace-nowrap"
                    : "board-toolbar-btn-sm"
                }
                title={t("board.filters.shortcutTitle")}
              >
                {focusMode ? t("board.filters.focusModeOn") : t("board.filters.focusModeOff")}
              </button>
              <button type="button" onClick={clearFilters} className="board-toolbar-btn-sm shrink-0 whitespace-nowrap">
                {t("board.filters.clear")}
              </button>
              <button
                type="button"
                onClick={() => setLabelsOpen((o) => !o)}
                className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-semibold font-display transition-all duration-200 border whitespace-nowrap ${
                  labelsOpen
                    ? "border-[var(--flux-primary)] bg-[var(--flux-primary-glow)] text-[var(--flux-primary-light)] shadow-[inset_0_1px_0_var(--flux-border-muted)]"
                    : "border-transparent bg-transparent text-[var(--flux-text-muted)] hover:border-[var(--flux-border-subtle)] hover:bg-[var(--flux-surface-hover)] hover:text-[var(--flux-text)]"
                }`}
              >
                <span>{t("board.filters.labelsButton")}</span>
                <span className={`text-[9px] transition-transform duration-200 ${labelsOpen ? "rotate-180" : ""}`} aria-hidden>
                  ▼
                </span>
              </button>
              <button type="button" onClick={onOpenMapa} className="board-toolbar-btn-sm shrink-0 whitespace-nowrap">
                {t("board.filters.mapButton")}
              </button>
              <button type="button" onClick={onOpenDaily} className="board-toolbar-btn-sm shrink-0 whitespace-nowrap">
                {t("board.filters.dailyButton")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {labelsOpen && (
        <div className="w-full px-4 sm:px-5 lg:px-6 py-2 flex gap-1.5 flex-wrap border-t border-[var(--flux-border-muted)] bg-[var(--flux-surface-mid)]/30">
          {boardLabels.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => onToggleLabel(l)}
              className={`btn-pill-compact transition-all duration-200 ${
                activeLabels.has(l)
                  ? "bg-[var(--flux-primary)] text-white border-[var(--flux-primary)] shadow-sm"
                  : "bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] border-[var(--flux-control-border)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-glow)]"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
