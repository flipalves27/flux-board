"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import type { BoardViewMode } from "./kanban-constants";

type KanbanHeaderBarProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  priorityBarVisible: boolean;
  setPriorityBarVisible: Dispatch<SetStateAction<boolean>>;
  boardView: BoardViewMode;
  setBoardView: (v: BoardViewMode) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  csvImportMode: "replace" | "merge";
  setCsvImportMode: Dispatch<SetStateAction<"replace" | "merge">>;
  onImportCSV: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportCSV: () => void;
};

function IconKanban({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
    </svg>
  );
}

function IconTable({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconTimeline({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path d="M4 7h5v4H4V7zm7 0h9v4h-9V7zM4 14h8v4H4v-4zm10 0h6v4h-6v-4z" />
    </svg>
  );
}

export function KanbanHeaderBar({
  t,
  priorityBarVisible,
  setPriorityBarVisible,
  boardView,
  setBoardView,
  searchInputRef,
  searchQuery,
  setSearchQuery,
  csvImportMode,
  setCsvImportMode,
  onImportCSV,
  onExportCSV,
}: KanbanHeaderBarProps) {
  return (
    <div className="w-full px-4 sm:px-5 lg:px-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 min-h-[42px]">
      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
        <CustomTooltip
          content={priorityBarVisible ? t("board.filters.hideTooltip") : t("board.filters.showTooltip")}
          position="bottom"
        >
          <button
            type="button"
            onClick={() => setPriorityBarVisible((v) => !v)}
            className="board-toolbar-btn gap-1 px-2 -ml-1 shrink-0"
            aria-expanded={priorityBarVisible}
            aria-label={priorityBarVisible ? t("board.filters.hideTooltip") : t("board.filters.showTooltip")}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--flux-text)]">
              {t("board.filters.title")}
            </span>
            <span
              className={`inline-block text-[10px] text-[var(--flux-text-muted)] transition-transform duration-300 ease-out ${priorityBarVisible ? "rotate-0" : "-rotate-90"}`}
              aria-hidden
            >
              ▼
            </span>
          </button>
        </CustomTooltip>
        <div
          className="board-segment flex items-center gap-0.5 p-1 shrink-0 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-08)]"
          role="group"
          aria-label={t("board.timeline.toggleGroupAria")}
        >
          <CustomTooltip content={t("board.timeline.viewKanbanTooltip")} position="bottom">
            <button
              type="button"
              onClick={() => setBoardView("kanban")}
              className={`px-2.5 py-2 rounded-md transition-all duration-200 flex items-center justify-center ${
                boardView === "kanban"
                  ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }`}
              aria-pressed={boardView === "kanban"}
              aria-label={t("board.timeline.viewKanbanAria")}
            >
              <IconKanban active={boardView === "kanban"} />
            </button>
          </CustomTooltip>
          <CustomTooltip content={t("board.timeline.viewTableTooltip")} position="bottom">
            <button
              type="button"
              onClick={() => setBoardView("table")}
              className={`px-2.5 py-2 rounded-md transition-all duration-200 flex items-center justify-center ${
                boardView === "table"
                  ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }`}
              aria-pressed={boardView === "table"}
              aria-label={t("board.timeline.viewTableAria")}
            >
              <IconTable active={boardView === "table"} />
            </button>
          </CustomTooltip>
          <CustomTooltip content={t("board.timeline.viewTimelineTooltip")} position="bottom">
            <button
              type="button"
              onClick={() => setBoardView("timeline")}
              className={`px-2.5 py-2 rounded-md transition-all duration-200 flex items-center justify-center ${
                boardView === "timeline"
                  ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }`}
              aria-pressed={boardView === "timeline"}
              aria-label={t("board.timeline.viewTimelineAria")}
            >
              <IconTimeline active={boardView === "timeline"} />
            </button>
          </CustomTooltip>
        </div>
      </div>

      {priorityBarVisible && (
        <div
          className="board-toolbar-group flex flex-wrap items-center gap-1.5 p-1.5 pl-2.5 w-full lg:w-auto lg:max-w-[min(100%,500px)] lg:ml-auto justify-end"
          aria-label={t("board.toolbar.sectionData")}
        >
          <div className="relative flex-1 min-w-[min(100%,180px)] sm:min-w-[210px]">
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--flux-text-muted)] opacity-50 text-sm select-none"
              aria-hidden
            >
              ⌕
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("board.filters.searchPlaceholder")}
              className="w-full pl-8 pr-2 py-1 rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] text-xs bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[var(--flux-primary-alpha-20)] outline-none transition-all duration-200"
            />
          </div>
          <select
            value={csvImportMode}
            onChange={(e) => setCsvImportMode(e.target.value as "replace" | "merge")}
            className="shrink-0 min-w-[96px] px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] text-[11px] font-medium bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[var(--flux-primary-alpha-20)] outline-none transition-all duration-200 cursor-pointer"
            aria-label={t("board.toolbar.csvImportModeAria")}
          >
            <option value="replace">{t("board.toolbar.csvImportMode.replace")}</option>
            <option value="merge">{t("board.toolbar.csvImportMode.merge")}</option>
          </select>
          <label className="board-toolbar-data-btn cursor-pointer whitespace-nowrap">
            {t("board.toolbar.import")}
            <input type="file" accept=".csv" className="hidden" onChange={onImportCSV} />
          </label>
          <button type="button" onClick={onExportCSV} className="board-toolbar-data-btn whitespace-nowrap">
            {t("board.toolbar.export")}
          </button>
        </div>
      )}
    </div>
  );
}
