"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import type { ReactNode } from "react";

type BoardChromeLayerCollapsibleProps = {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, children are always visible (no collapsible chrome). */
  forceExpanded: boolean;
  triggerLabel: string;
  triggerSummary?: ReactNode;
  children: ReactNode;
};

/**
 * Radix Collapsible for L2/L3 on small viewports: removes closed content
 * from tab order and keeps expand/collapse semantics for assistive tech.
 */
export function BoardChromeLayerCollapsible({
  id,
  open,
  onOpenChange,
  forceExpanded,
  triggerLabel,
  triggerSummary,
  children,
}: BoardChromeLayerCollapsibleProps) {
  if (forceExpanded) {
    return <>{children}</>;
  }

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-3 py-1 sm:px-4 md:hidden">
        <Collapsible.Trigger
          type="button"
          className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md py-1.5 text-left text-flux-xs font-semibold text-[var(--flux-text-muted)] hover:bg-[var(--flux-surface-hover)] hover:text-[var(--flux-text)] transition-colors"
          aria-controls={`${id}-panel`}
          id={`${id}-trigger`}
        >
          <span className="truncate">{triggerLabel}</span>
          <span className="shrink-0 tabular-nums text-[var(--flux-text-muted)]" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </Collapsible.Trigger>
        {triggerSummary && !open ? (
          <div className="pb-1.5 text-flux-xs text-[var(--flux-text-muted)]">{triggerSummary}</div>
        ) : null}
      </div>
      <Collapsible.Content
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className="data-[state=closed]:hidden overflow-hidden motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-safe:duration-150"
      >
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
