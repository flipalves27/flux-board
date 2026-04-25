"use client";

import { CustomTooltip } from "@/components/ui/custom-tooltip";
import type { BoardViewMode } from "./kanban-constants";

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

function IconEisenhower({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path d="M3 3h18v18H3V3zm8 1v16h2V4h-2zM4 11v2h16v-2H4z" />
    </svg>
  );
}

function IconExecutive({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path
        d="M4 19V5M4 19h16M4 5h16M8 15v-4M12 15V9M16 15v-2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSwot({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8zM5 5v4h4V5H5zm10 0v4h4V5h-4zM5 15v4h4v-4H5zm10 0v4h4v-4h-4z" />
    </svg>
  );
}

function IconStrategicPortfolio({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path
        d="M4 18h16M6 15l4-4 3 2 5-7M6 6h4v4H6V6zm8 8h4v4h-4v-4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRoadmap({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path
        d="M4 6h4v4H4V6zm6 2h10M4 14h4v4H4v-4zm6 1h10M4 10h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFlowMetrics({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`shrink-0 ${active ? "text-white" : "text-[var(--flux-text-muted)]"}`}
    >
      <path d="M4 19h3V9H4v10zm5 0h3V5H9v14zm5 0h3v-6h-3v6z" />
    </svg>
  );
}

const MODE_DEFS: {
  mode: BoardViewMode;
  kbd: string;
  tooltipKey: string;
  ariaKey: string;
}[] = [
  { mode: "kanban", kbd: "K", tooltipKey: "viewKanbanTooltip", ariaKey: "viewKanbanAria" },
  { mode: "table", kbd: "T", tooltipKey: "viewTableTooltip", ariaKey: "viewTableAria" },
  { mode: "timeline", kbd: "TL", tooltipKey: "viewTimelineTooltip", ariaKey: "viewTimelineAria" },
  { mode: "eisenhower", kbd: "E", tooltipKey: "viewEisenhowerTooltip", ariaKey: "viewEisenhowerAria" },
  { mode: "swot", kbd: "S", tooltipKey: "viewSwotTooltip", ariaKey: "viewSwotAria" },
  { mode: "strategic_portfolio", kbd: "P", tooltipKey: "viewStrategicPortfolioTooltip", ariaKey: "viewStrategicPortfolioAria" },
  { mode: "executive", kbd: "G", tooltipKey: "viewExecutiveTooltip", ariaKey: "viewExecutiveAria" },
  { mode: "roadmap", kbd: "R", tooltipKey: "viewRoadmapTooltip", ariaKey: "viewRoadmapAria" },
  { mode: "flow_metrics", kbd: "F", tooltipKey: "viewFlowMetricsTooltip", ariaKey: "viewFlowMetricsAria" },
];

function renderIcon(mode: BoardViewMode, active: boolean) {
  switch (mode) {
    case "kanban":
      return <IconKanban active={active} />;
    case "table":
      return <IconTable active={active} />;
    case "timeline":
      return <IconTimeline active={active} />;
    case "eisenhower":
      return <IconEisenhower active={active} />;
    case "swot":
      return <IconSwot active={active} />;
    case "strategic_portfolio":
      return <IconStrategicPortfolio active={active} />;
    case "executive":
      return <IconExecutive active={active} />;
    case "roadmap":
      return <IconRoadmap active={active} />;
    case "flow_metrics":
      return <IconFlowMetrics active={active} />;
    default:
      return <IconKanban active={active} />;
  }
}

export type BoardViewModeSegmentProps = {
  boardView: BoardViewMode;
  setBoardView: (v: BoardViewMode) => void;
  allowedViewModes: readonly BoardViewMode[];
  tTimeline: (key: string) => string;
  /** NLQ uses larger icon buttons; compact chrome uses key caps. */
  variant: "icons" | "keys";
  groupAriaLabel: string;
};

export function BoardViewModeSegment({
  boardView,
  setBoardView,
  allowedViewModes,
  tTimeline,
  variant,
  groupAriaLabel,
}: BoardViewModeSegmentProps) {
  const allow = new Set(allowedViewModes);
  const defs = MODE_DEFS.filter((d) => allow.has(d.mode));

  return (
    <div
      className="board-segment flex items-center gap-0.5 p-1 shrink-0 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-08)]"
      role="group"
      aria-label={groupAriaLabel}
    >
      {defs.map((d) => {
        const isOn = boardView === d.mode;
        const base =
          variant === "icons"
            ? `px-2.5 py-2 rounded-md transition-all duration-200 flex items-center justify-center ${
                isOn
                  ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }`
            : `px-2 py-1.5 rounded-md transition-all duration-200 flex items-center justify-center ${
                isOn
                  ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }`;
        return (
          <CustomTooltip key={d.mode} content={tTimeline(d.tooltipKey)} position="bottom">
            <button
              type="button"
              onClick={() => setBoardView(d.mode)}
              className={base}
              aria-pressed={isOn}
              aria-label={tTimeline(d.ariaKey)}
            >
              {variant === "icons" ? (
                renderIcon(d.mode, isOn)
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wide">{d.kbd}</span>
              )}
            </button>
          </CustomTooltip>
        );
      })}
    </div>
  );
}
