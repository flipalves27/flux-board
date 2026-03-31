"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useCopilotStore } from "@/stores/copilot-store";
import { useFluxyBoardDockStore } from "@/stores/fluxy-board-dock-store";
import { useBoardActivityStore } from "@/stores/board-activity-store";
import { useBoardExecutionInsightsStore } from "@/stores/board-execution-insights-store";
import { useFluxyState } from "@/context/fluxy-presence-context";
import { FluxyDock } from "@/components/fluxy/fluxy-dock";
import { trackFluxyEvent } from "@/lib/fluxy-telemetry";

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
  const copilotOpen = useCopilotStore((s) => s.open);
  const copilotGenerating = useCopilotStore((s) => s.generating);
  const fluxy = useFluxyState({ isOpen: copilotOpen, isGenerating: copilotGenerating, source: "board" });

  useEffect(() => {
    trackFluxyEvent({
      event: "fluxy_state_changed",
      mode: "board",
      state: fluxy.visualState,
      origin: "board_dock",
    });
  }, [fluxy.visualState]);

  const onOpenAssistant = () => {
    trackFluxyEvent({ event: "fluxy_dock_opened", mode: "board", origin: "launcher_open" });
    trackFluxyEvent({ event: "fluxy_cta_clicked", mode: "board", origin: "copilot_open" });
    useBoardActivityStore.getState().setOpen(false);
    useBoardExecutionInsightsStore.getState().setOpen(false);
    toggleOpen();
  };

  const bottom = "max(1rem, env(safe-area-inset-bottom, 0px))";
  return (
    <FluxyDock
      show={true}
      hydrated={hydrated}
      dockVisible={dockVisible}
      setDockVisible={setDockVisible}
      restoreContainerClassName="fixed z-[var(--flux-z-board-fluxy-dock)] motion-safe:transition-[transform,bottom] motion-safe:duration-200 left-1/2 -translate-x-1/2 max-md:max-w-[calc(100vw-2rem)]"
      launcherContainerClassName="fixed z-[var(--flux-z-board-fluxy-dock)] flex items-end justify-center motion-safe:transition-[transform,bottom] motion-safe:duration-200 left-1/2 -translate-x-1/2 w-[min(100vw-2rem,320px)]"
      positionStyle={{ bottom }}
      restore={{
        label: t("restore"),
        ariaLabel: t("restoreAria"),
        avatarState: fluxy.visualState,
        buttonClassName: "inline-flex items-center gap-2 rounded-full border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-surface-card)] px-3 py-2 text-[11px] font-semibold text-[var(--flux-primary-light)] shadow-[var(--flux-shadow-md)] backdrop-blur-md hover:border-[var(--flux-primary)] hover:bg-[var(--flux-primary-alpha-12)]",
        iconWrapperClassName: "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)] text-[var(--flux-primary-light)]",
      }}
      launcher={{
        onOpen: onOpenAssistant,
        openAriaLabel: t("openAssistant"),
        hideAriaLabel: t("hideDock"),
        hideTitle: t("hideDock"),
        avatarState: fluxy.visualState,
        containerClassName: "flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--flux-primary-alpha-28)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-18),var(--flux-secondary-alpha-10))] py-2 pl-2 pr-2 shadow-[var(--flux-shadow-primary-panel)] backdrop-blur-md",
        openButtonClassName: "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-[var(--flux-primary-alpha-08)] motion-safe:transition-colors",
        avatarWrapperClassName: "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)] text-[var(--flux-primary-light)]",
        title: tFluxy("title"),
        subtitle: t("chipLabel"),
      }}
      onRestoreDock={() => trackFluxyEvent({ event: "fluxy_dock_opened", mode: "board", origin: "restore" })}
    />
  );
}
