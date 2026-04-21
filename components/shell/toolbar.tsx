"use client";

import { useCallback } from "react";
import { useCopilotStore } from "@/stores/copilot-store";
import { useSidebarLayout } from "@/context/sidebar-layout-context";

/** UX v2 — lightweight primary actions rail (replaces workspace Fluxy dock entry when flagged). */
export function Toolbar() {
  const toggleOpen = useCopilotStore((s) => s.toggleOpen);
  const layout = useSidebarLayout().layout;

  const onCopilot = useCallback(() => {
    toggleOpen();
  }, [toggleOpen]);

  const isMobile = layout === "mobile";

  return (
    <div
      className={`pointer-events-none fixed z-[var(--flux-z-board-tools-rail)] flex gap-2 ${
        isMobile
          ? "bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 flex-row"
          : "bottom-6 right-[max(1rem,env(safe-area-inset-right,0px))] flex-col"
      }`}
    >
      <button
        type="button"
        onClick={onCopilot}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] text-[var(--flux-primary-light)] shadow-[var(--flux-shadow-lg)] transition-transform motion-safe:active:scale-95"
        aria-label="Copilot"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </button>
    </div>
  );
}
