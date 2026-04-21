"use client";

import type { CardData } from "@/app/board/[id]/page";
import { useCopilotStore } from "@/stores/copilot-store";
import { useBoardActivityStore } from "@/stores/board-activity-store";
import { useBoardExecutionInsightsStore } from "@/stores/board-execution-insights-store";
import { useTranslations } from "next-intl";

type NextActionEntry = { card: CardData; score: number; due: number | null };
type WipRiskEntry = { key: string; label: string; count: number };

export type BoardExecutionInsightsPayload = {
  nextActions: NextActionEntry[];
  wipRiskColumns: WipRiskEntry[];
};

type BoardExecutionInsightsPanelProps = {
  executionInsights: BoardExecutionInsightsPayload;
  t: (key: string, values?: Record<string, string | number>) => string;
  onOpenCard: (card: CardData) => void;
  hideDesktopFab?: boolean;
};

export function BoardExecutionInsightsPanel({
  executionInsights,
  t,
  onOpenCard,
  hideDesktopFab = false,
}: BoardExecutionInsightsPanelProps) {
  const tFab = useTranslations("kanban.executionInsights");
  const copilotOpen = useCopilotStore((s) => s.open);
  const setCopilotOpen = useCopilotStore((s) => s.setOpen);
  const open = useBoardExecutionInsightsStore((s) => s.open);
  const setOpen = useBoardExecutionInsightsStore((s) => s.setOpen);
  const toggleOpen = useBoardExecutionInsightsStore((s) => s.toggleOpen);

  const fabRight = copilotOpen ? "right-[calc(min(440px,92vw)+16px)]" : "right-4";

  const onOpenToggle = () => {
    if (!open) {
      setCopilotOpen(false);
      useBoardActivityStore.getState().setOpen(false);
    }
    toggleOpen();
  };

  return (
    <>
      <button
        type="button"
        className={`${hideDesktopFab ? "md:hidden " : ""}fixed z-[468] transition-all duration-200 active:scale-[0.98] ${fabRight} top-[224px]`}
        onClick={onOpenToggle}
        aria-expanded={open}
        aria-label={open ? tFab("fabClose") : tFab("fabOpen")}
      >
        <span className="relative inline-flex items-center gap-2 rounded-l-xl rounded-r-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-mid)] px-2.5 py-2 text-[var(--flux-text)] shadow-[var(--flux-shadow-copilot-bubble)] backdrop-blur-md hover:border-[var(--flux-primary)]">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-[11px] font-semibold whitespace-nowrap">{open ? tFab("fabClose") : tFab("fabOpen")}</span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[485] pointer-events-none">
          <div className="absolute right-4 top-[92px] bottom-4 w-[min(440px,92vw)] bg-[var(--flux-surface-card)] border border-[var(--flux-border-subtle)] rounded-[var(--flux-rad)] shadow-[0_18px_60px_var(--flux-black-alpha-45)] pointer-events-auto flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--flux-chrome-alpha-08)] flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-bold font-display text-[var(--flux-primary-light)] truncate">{tFab("title")}</div>
                <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">{tFab("subtitle")}</div>
              </div>
              <button type="button" className="btn-secondary px-3 py-1.5 shrink-0" onClick={() => setOpen(false)}>
                {tFab("fabClose")}
              </button>
            </div>

            <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
              <div className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-24)] bg-[var(--flux-surface-card)] p-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)] mb-1.5">
                  {t("board.nextActions.title")}
                </div>
                <div className="space-y-1.5">
                  {executionInsights.nextActions.length === 0 ? (
                    <p className="text-xs text-[var(--flux-text-muted)]">{tFab("emptyNextActions")}</p>
                  ) : (
                    executionInsights.nextActions.map((entry) => (
                      <button
                        key={entry.card.id}
                        type="button"
                        onClick={() => {
                          onOpenCard(entry.card);
                          setOpen(false);
                        }}
                        className="w-full text-left rounded-md border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 hover:border-[var(--flux-primary)] transition-colors"
                      >
                        <div className="text-xs font-semibold text-[var(--flux-text)] truncate">{entry.card.title}</div>
                        <div className="text-[10px] text-[var(--flux-text-muted)]">
                          {t(`cardModal.options.priority.${entry.card.priority}`)} ·{" "}
                          {t(`cardModal.options.progress.${entry.card.progress}`)}
                          {entry.due !== null
                            ? ` · ${t("board.nextActions.duePrefix")} ${
                                entry.due < 0
                                  ? t("card.due.overdue", { days: Math.abs(entry.due) })
                                  : entry.due === 0
                                    ? t("card.due.today")
                                    : t("card.due.future", { days: entry.due })
                              }`
                            : ""}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-danger-alpha-24)] bg-[var(--flux-surface-card)] p-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-danger)] mb-1.5">
                  {t("board.wipRisk.title")}
                </div>
                {executionInsights.wipRiskColumns.length === 0 ? (
                  <p className="text-xs text-[var(--flux-text-muted)]">{t("board.wipRisk.emptyMessage", { minItems: 4 })}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {executionInsights.wipRiskColumns.map((entry) => (
                      <span
                        key={entry.key}
                        className="rounded-full border border-[var(--flux-danger-alpha-40)] bg-[var(--flux-danger-alpha-14)] px-2 py-0.5 text-[11px] font-semibold text-[var(--flux-text)]"
                      >
                        {entry.label}: {entry.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
