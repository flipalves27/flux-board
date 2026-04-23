"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type BoardChromeLayerCollapsibleProps = {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  triggerSummary?: ReactNode;
  children: ReactNode;
};

/**
 * Radix Collapsible para faixas L2/L3: recolhe em qualquer viewport, mantém a11y
 * e liberta altura para o canvas Kanban.
 */
export function BoardChromeLayerCollapsible({
  id,
  open,
  onOpenChange,
  triggerLabel,
  triggerSummary,
  children,
}: BoardChromeLayerCollapsibleProps) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <div className="border-b border-[var(--flux-chrome-alpha-10)] bg-[color-mix(in_srgb,var(--flux-surface-card)_88%,transparent)] backdrop-blur-[6px]">
        <Collapsible.Trigger
          type="button"
          className="group flex w-full min-w-0 items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-[var(--flux-surface-hover)] sm:px-5 lg:px-6 motion-safe:duration-150"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-trigger`}
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--flux-text-muted)] transition-transform duration-200 ease-out ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
            strokeWidth={2.25}
          />
          <span className="min-w-0 truncate text-flux-xs font-semibold tracking-tight text-[var(--flux-text)]">
            {triggerLabel}
          </span>
          {!open && triggerSummary ? (
            <span className="ml-auto min-w-0 max-w-[min(100%,280px)] truncate text-right text-flux-xs font-medium text-[var(--flux-text-muted)]">
              {triggerSummary}
            </span>
          ) : null}
        </Collapsible.Trigger>
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
