"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useCopilotStore } from "@/stores/copilot-store";
import { useBoardActivityStore } from "@/stores/board-activity-store";
import { useBoardExecutionInsightsStore } from "@/stores/board-execution-insights-store";
import type { BoardViewMode } from "./kanban-constants";

type BoardMobileToolHubProps = {
  onOpenDaily: () => void;
  onToggleFocusMode?: () => void;
  onOpenFilters?: () => void;
  onNewCard?: () => void;
  boardView: BoardViewMode;
  setBoardView: (view: BoardViewMode) => void;
  allowedViewModes: readonly BoardViewMode[];
  tTimeline: (key: string) => string;
};

const VIEW_LABEL_KEYS: Record<BoardViewMode, string> = {
  kanban: "viewKanbanTooltip",
  table: "viewTableTooltip",
  timeline: "viewTimelineTooltip",
  eisenhower: "viewEisenhowerTooltip",
  swot: "viewSwotTooltip",
  strategic_portfolio: "viewStrategicPortfolioTooltip",
  executive: "viewExecutiveTooltip",
  roadmap: "viewRoadmapTooltip",
  flow_metrics: "viewFlowMetricsTooltip",
};

export function BoardMobileToolHub({
  onOpenDaily,
  onToggleFocusMode,
  onOpenFilters,
  onNewCard,
  boardView,
  setBoardView,
  allowedViewModes,
  tTimeline,
}: BoardMobileToolHubProps) {
  const t = useTranslations("kanban.board.mobileTools");
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const setCopilotOpen = useCopilotStore((s) => s.setOpen);
  const toggleCopilot = useCopilotStore((s) => s.toggleOpen);
  const setActivityOpen = useBoardActivityStore((s) => s.setOpen);
  const toggleActivity = useBoardActivityStore((s) => s.toggleOpen);
  const setInsightsOpen = useBoardExecutionInsightsStore((s) => s.setOpen);
  const toggleInsights = useBoardExecutionInsightsStore((s) => s.toggleOpen);

  const closeOthersForCopilot = useCallback(() => {
    setActivityOpen(false);
    setInsightsOpen(false);
  }, [setActivityOpen, setInsightsOpen]);

  const closeOthersForActivity = useCallback(() => {
    setCopilotOpen(false);
    setInsightsOpen(false);
  }, [setCopilotOpen, setInsightsOpen]);

  const closeOthersForInsights = useCallback(() => {
    setCopilotOpen(false);
    setActivityOpen(false);
  }, [setCopilotOpen, setActivityOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const el = panelRef.current;
      if (!el?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, [open]);

  return (
    <div className="md:hidden fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-[var(--flux-z-mobile-tool-hub)] flex flex-col items-end gap-2">
      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={t("menuLabel")}
          className="mb-1 max-h-[min(72dvh,560px)] w-[min(340px,calc(100vw-2rem))] overflow-y-auto rounded-[var(--flux-rad-lg)] border border-[var(--flux-border-default)] bg-[color-mix(in_srgb,var(--flux-surface-card)_94%,transparent)] p-2 shadow-[var(--flux-shadow-modal-depth)] backdrop-blur-[18px] scrollbar-flux"
        >
          <div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("sectionPrimary")}
          </div>
          {onNewCard ? (
            <MenuRow
              label={t("newCard")}
              onClick={() => {
                onNewCard();
                setOpen(false);
              }}
            />
          ) : null}
          {onOpenFilters ? (
            <MenuRow
              label={t("filters")}
              onClick={() => {
                onOpenFilters();
                setOpen(false);
              }}
            />
          ) : null}
          <div className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("sectionView")}
          </div>
          <div className="grid grid-cols-2 gap-1 px-1 pb-1" role="group" aria-label={t("viewGroup")}>
            {allowedViewModes.map((mode) => (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={boardView === mode}
                className={`min-h-11 rounded-lg border px-2 py-2 text-left text-xs font-semibold transition-colors ${
                  boardView === mode
                    ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                    : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-08)]"
                }`}
                onClick={() => {
                  setBoardView(mode);
                  setOpen(false);
                }}
              >
                {tTimeline(VIEW_LABEL_KEYS[mode])}
              </button>
            ))}
          </div>
          <div className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("sectionTools")}
          </div>
          <MenuRow
            label={t("copilot")}
            onClick={() => {
              closeOthersForCopilot();
              toggleCopilot();
              setOpen(false);
            }}
          />
          <MenuRow
            label={t("insights")}
            onClick={() => {
              closeOthersForInsights();
              toggleInsights();
              setOpen(false);
            }}
          />
          <MenuRow
            label={t("activity")}
            onClick={() => {
              closeOthersForActivity();
              toggleActivity();
              setOpen(false);
            }}
          />
          <MenuRow
            label={t("daily")}
            onClick={() => {
              setCopilotOpen(false);
              setActivityOpen(false);
              setInsightsOpen(false);
              onOpenDaily();
              setOpen(false);
            }}
          />
          {onToggleFocusMode ? (
            <MenuRow
              label={t("focusMode")}
              onClick={() => {
                onToggleFocusMode();
                setOpen(false);
              }}
            />
          ) : null}
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-[var(--flux-primary-alpha-35)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-22),var(--flux-secondary-alpha-14))] text-[var(--flux-text)] shadow-[var(--flux-shadow-copilot-bubble)] backdrop-blur-md transition-transform active:scale-[0.96]"
        aria-label={open ? t("closeMenu") : t("openMenu")}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          {open ? (
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
          )}
        </svg>
      </button>
    </div>
  );
}

function MenuRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex min-h-12 w-full items-center rounded-lg px-3 py-3 text-left text-sm font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-primary-alpha-08)] active:bg-[var(--flux-primary-alpha-12)]"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
