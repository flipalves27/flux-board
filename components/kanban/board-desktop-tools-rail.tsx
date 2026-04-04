"use client";

import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";
import { useTranslations } from "next-intl";
import { useCopilotStore } from "@/stores/copilot-store";
import { useBoardActivityStore } from "@/stores/board-activity-store";
import { useBoardExecutionInsightsStore } from "@/stores/board-execution-insights-store";
import { openBoardDesktopDaily } from "@/lib/board-desktop-daily-bridge";
import { AiAssistantIcon } from "@/components/icons/ai-assistant-icon";

const RAIL_LEAVE_MS = 320;
const LS_PINNED_KEY = "flux:desktop-tools-rail-pinned";

function toolButtonClass(active: boolean) {
  return [
    "relative inline-flex w-full items-center justify-end gap-2 rounded-l-xl rounded-r-md border px-2.5 py-2 text-[var(--flux-text)] shadow-[var(--flux-shadow-copilot-bubble)] backdrop-blur-md transition-colors duration-200",
    active
      ? "border-[var(--flux-primary)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-22),var(--flux-secondary-alpha-14))]"
      : "border-[var(--flux-border-default)] bg-[var(--flux-surface-mid)] hover:border-[var(--flux-primary)]",
  ].join(" ");
}

export function BoardDesktopToolsRail() {
  const tRail = useTranslations("kanban.board.desktopToolsRail");
  const tActivity = useTranslations("kanban.activity");
  const tExecution = useTranslations("kanban.executionInsights");
  const tFilters = useTranslations("kanban.board.filters");

  const copilotOpen = useCopilotStore((s) => s.open);
  const toggleCopilot = useCopilotStore((s) => s.toggleOpen);
  const tier = useCopilotStore((s) => s.tier);
  const freeDemoRemaining = useCopilotStore((s) => s.freeDemoRemaining);
  const activityOpen = useBoardActivityStore((s) => s.open);
  const toggleActivity = useBoardActivityStore((s) => s.toggleOpen);
  const setActivityOpen = useBoardActivityStore((s) => s.setOpen);

  const executionOpen = useBoardExecutionInsightsStore((s) => s.open);
  const toggleExecution = useBoardExecutionInsightsStore((s) => s.toggleOpen);
  const setExecutionOpen = useBoardExecutionInsightsStore((s) => s.setOpen);

  const setCopilotOpen = useCopilotStore((s) => s.setOpen);

  const [pinned, setPinned] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(LS_PINNED_KEY);
    return stored === null ? true : stored === "1";
  });
  const [hoverOpen, setHoverOpen] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  const showTools = pinned || hoverOpen || focusInside;

  const fabRight = copilotOpen ? "right-[calc(min(440px,92vw)+16px)]" : "right-0";

  const onRailEnter = useCallback(() => {
    clearLeaveTimer();
    setHoverOpen(true);
  }, [clearLeaveTimer]);

  const onRailLeave = useCallback(() => {
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      setHoverOpen(false);
      leaveTimerRef.current = null;
    }, RAIL_LEAVE_MS);
  }, [clearLeaveTimer]);

  const onCopilotClick = useCallback(() => {
    if (!copilotOpen) {
      setActivityOpen(false);
      setExecutionOpen(false);
    }
    toggleCopilot();
  }, [copilotOpen, setActivityOpen, setExecutionOpen, toggleCopilot]);

  const onActivityClick = useCallback(() => {
    if (!activityOpen) {
      setCopilotOpen(false);
      setExecutionOpen(false);
    }
    toggleActivity();
  }, [activityOpen, setCopilotOpen, setExecutionOpen, toggleActivity]);

  const onExecutionClick = useCallback(() => {
    if (!executionOpen) {
      setCopilotOpen(false);
      setActivityOpen(false);
    }
    toggleExecution();
  }, [executionOpen, setCopilotOpen, setActivityOpen, toggleExecution]);

  const onDailyClick = useCallback(() => {
    openBoardDesktopDaily();
  }, []);

  const onHandleClick = useCallback(() => {
    setPinned((p) => {
      const next = !p;
      localStorage.setItem(LS_PINNED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const onFocusCapture = useCallback(() => {
    setFocusInside(true);
  }, []);

  const onBlurCapture = useCallback((e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setFocusInside(false);
  }, []);

  return (
    <div
      className={`max-md:hidden fixed z-[var(--flux-z-board-tools-rail)] bottom-6 top-auto flex flex-row-reverse items-end gap-1.5 pl-1 ${fabRight} motion-safe:transition-[right] motion-safe:duration-200`}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      <button
        type="button"
        className={`group/handle flex shrink-0 flex-col items-center justify-center gap-1 rounded-l-[14px] rounded-r-none border border-r-0 border-[var(--flux-border-default)] bg-[linear-gradient(180deg,var(--flux-primary-alpha-18),var(--flux-secondary-alpha-12))] px-1.5 py-3 text-[var(--flux-text-muted)] shadow-[var(--flux-shadow-copilot-bubble)] backdrop-blur-md motion-safe:transition-colors motion-safe:duration-200 hover:text-[var(--flux-text)] hover:border-[var(--flux-primary)] ${
          pinned ? "border-[var(--flux-primary)] text-[var(--flux-primary-light)]" : ""
        }`}
        onClick={onHandleClick}
        aria-expanded={showTools}
        aria-pressed={pinned}
        aria-label={pinned ? tRail("handleUnpin") : tRail("handlePin")}
        title={tRail("handleTitle")}
        onMouseEnter={onRailEnter}
        onMouseLeave={onRailLeave}
      >
        {showTools ? (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 motion-safe:transition-transform motion-safe:duration-300 rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="currentColor"
            aria-hidden
          >
            <circle cx="4" cy="4" r="1.5" />
            <circle cx="12" cy="4" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
          </svg>
        )}
      </button>

      <div
        className={`flex flex-col gap-2 pr-0.5 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${
          showTools ? "translate-x-0" : "translate-x-[calc(100%+10px)]"
        } ${showTools ? "pointer-events-auto" : "pointer-events-none"}`}
        onMouseEnter={onRailEnter}
        onMouseLeave={onRailLeave}
      >
        <button
          type="button"
          className="flex justify-end active:scale-[0.98] motion-safe:transition-transform motion-safe:duration-200"
          onClick={onActivityClick}
          aria-expanded={activityOpen}
          aria-label={activityOpen ? tActivity("fabClose") : tActivity("fabOpen")}
        >
          <span className={toolButtonClass(activityOpen)}>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)]">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </span>
            <span className="text-[11px] font-semibold whitespace-nowrap">
              {activityOpen ? tActivity("fabClose") : tActivity("fabOpen")}
            </span>
          </span>
        </button>

        <button
          type="button"
          className="flex justify-end active:scale-[0.98] motion-safe:transition-transform motion-safe:duration-200"
          onClick={onExecutionClick}
          aria-expanded={executionOpen}
          aria-label={executionOpen ? tExecution("fabClose") : tExecution("fabOpen")}
        >
          <span className={toolButtonClass(executionOpen)}>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)]">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-[11px] font-semibold whitespace-nowrap">
              {executionOpen ? tExecution("fabClose") : tExecution("fabOpen")}
            </span>
          </span>
        </button>

        <div className="mx-auto my-1 w-6 border-t border-[var(--flux-chrome-alpha-12)]" />

        <button
          type="button"
          data-tour="board-daily"
          className="flex justify-end active:scale-[0.98] motion-safe:transition-transform motion-safe:duration-200"
          onClick={onDailyClick}
          aria-label={tFilters("dailyButton")}
        >
          <span className={toolButtonClass(false)}>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)]">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                <path d="M12 2l2.09 6.26L20 10l-5.91 4.26L16.18 21 12 17.27 7.82 21l2.09-6.74L4 10l5.91-1.74z" />
              </svg>
            </span>
            <span className="text-[11px] font-semibold whitespace-nowrap">{tFilters("dailyButton")}</span>
          </span>
        </button>

        <button
          type="button"
          data-tour="board-copilot"
          className="flex justify-end active:scale-[0.98] motion-safe:transition-transform motion-safe:duration-200"
          onClick={onCopilotClick}
          aria-expanded={copilotOpen}
          aria-label={copilotOpen ? tRail("copilotClose") : tRail("copilotOpen")}
        >
          <span className={toolButtonClass(copilotOpen)}>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)] text-[var(--flux-primary-light)]">
              <AiAssistantIcon className="h-3.5 w-3.5" />
            </span>
            <span className="text-[11px] font-semibold whitespace-nowrap">
              {copilotOpen ? tRail("copilotClose") : tRail("copilotOpen")}
            </span>
            {tier === "free" && freeDemoRemaining !== null ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--flux-warning-alpha-40)] text-[var(--flux-warning)]">
                {freeDemoRemaining}
              </span>
            ) : null}
          </span>
        </button>
      </div>
    </div>
  );
}
