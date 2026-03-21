"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";

type KanbanHeaderBarProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  csvImportMode: "replace" | "merge";
  setCsvImportMode: Dispatch<SetStateAction<"replace" | "merge">>;
  onImportCSV: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportCSV: () => void;
};

export function KanbanHeaderBar({
  t,
  searchInputRef,
  searchQuery,
  setSearchQuery,
  csvImportMode,
  setCsvImportMode,
  onImportCSV,
  onExportCSV,
}: KanbanHeaderBarProps) {
  return (
    <div className="w-full px-4 sm:px-5 lg:px-6 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 py-2 min-h-[42px]">
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
            data-flux-board-search
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
    </div>
  );
}
