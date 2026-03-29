"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useCopilotStore } from "@/stores/copilot-store";
import { useFluxyBoardDockStore } from "@/stores/fluxy-board-dock-store";
import { useBoardActivityStore } from "@/stores/board-activity-store";
import { useBoardExecutionInsightsStore } from "@/stores/board-execution-insights-store";
import { AiAssistantIcon } from "@/components/icons/ai-assistant-icon";

export function BoardFluxyDock() {
  const t = useTranslations("kanban.board.fluxyDock");
  const tFluxy = useTranslations("kanban.board.fluxyCopilot");

  const hydrateFromStorage = useFluxyBoardDockStore((s) => s.hydrateFromStorage);
  const dockVisible = useFluxyBoardDockStore((s) => s.dockVisible);
  const hydrated = useFluxyBoardDockStore((s) => s.hydrated);
  const setDockVisible = useFluxyBoardDockStore((s) => s.setDockVisible);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  const toggleOpen = useCopilotStore((s) => s.toggleOpen);

  const onOpenAssistant = () => {
    useBoardActivityStore.getState().setOpen(false);
    useBoardExecutionInsightsStore.getState().setOpen(false);
    toggleOpen();
  };

  if (!hydrated) return null;

  const bottom = "max(1rem, env(safe-area-inset-bottom, 0px))";

  if (!dockVisible) {
    return (
      <div
        className="fixed z-[var(--flux-z-board-fluxy-dock)] motion-safe:transition-[transform,bottom] motion-safe:duration-200 left-1/2 -translate-x-1/2 max-md:max-w-[calc(100vw-2rem)]"
        style={{ bottom }}
      >
        <button
          type="button"
          onClick={() => setDockVisible(true)}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-surface-card)] px-3 py-2 text-[11px] font-semibold text-[var(--flux-primary-light)] shadow-[var(--flux-shadow-md)] backdrop-blur-md hover:border-[var(--flux-primary)] hover:bg-[var(--flux-primary-alpha-12)]"
          aria-label={t("restoreAria")}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)] text-[var(--flux-primary-light)]">
            <AiAssistantIcon className="h-4 w-4" />
          </span>
          {t("restore")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[var(--flux-z-board-fluxy-dock)] flex items-end justify-center motion-safe:transition-[transform,bottom] motion-safe:duration-200 left-1/2 -translate-x-1/2 w-[min(100vw-2rem,320px)]"
      style={{ bottom }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--flux-primary-alpha-28)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-18),var(--flux-secondary-alpha-10))] py-2 pl-2 pr-2 shadow-[var(--flux-shadow-primary-panel)] backdrop-blur-md">
        <button
          type="button"
          onClick={onOpenAssistant}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-[var(--flux-primary-alpha-08)] motion-safe:transition-colors"
          aria-label={t("openAssistant")}
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)] text-[var(--flux-primary-light)]">
            <AiAssistantIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-sm font-bold text-[var(--flux-text)] leading-tight">{tFluxy("title")}</span>
            <span className="block text-[10px] text-[var(--flux-text-muted)] leading-snug">{t("chipLabel")}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setDockVisible(false)}
          className="btn-secondary shrink-0 px-2.5 py-2 text-[10px]"
          aria-label={t("hideDock")}
          title={t("hideDock")}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        </button>
      </div>
    </div>
  );
}
