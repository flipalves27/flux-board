"use client";

import type { ReactNode } from "react";

export type DockContainerProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right";
};

/** Shared chrome for docked panels (Fluxy, activity, insights, context). */
export function DockContainer({ title, open, onClose, children, side = "right" }: DockContainerProps) {
  if (!open) return null;
  const edge = side === "right" ? "right-0 border-l" : "left-0 border-r";
  return (
    <div
      className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] top-[min(5.5rem,calc(env(safe-area-inset-top,0px)+4rem))] z-[var(--flux-z-fab-panel-high)] w-[min(100vw-1.5rem,380px)] max-md:w-[min(100vw-1rem,100%)] ${edge} flex flex-col overflow-hidden rounded-[var(--flux-rad-lg)] border-[var(--flux-border-subtle)] bg-[color-mix(in_srgb,var(--flux-surface-card)_94%,transparent)] shadow-[var(--flux-shadow-modal-depth)] backdrop-blur-[14px]`}
      role="dialog"
      aria-modal="false"
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--flux-border-muted)] px-3 py-2">
        <span className="truncate font-display text-xs font-semibold text-[var(--flux-text)]">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-[var(--flux-rad-sm)] px-2 py-1 text-[11px] font-semibold text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-08)] hover:text-[var(--flux-text)]"
        >
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">{children}</div>
    </div>
  );
}
