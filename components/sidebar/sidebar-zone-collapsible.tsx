"use client";

import { useId, useState, type ReactNode } from "react";

type SidebarZoneCollapsibleProps = {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Collapsible stack region inside the sidebar (UX v2 zones). */
export function SidebarZoneCollapsible({ title, defaultOpen = true, children }: SidebarZoneCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const btnId = useId();

  return (
    <section className="min-w-0 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)]">
      <button
        id={btnId}
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
          {title}
        </span>
        <span className="shrink-0 text-[10px] text-[var(--flux-text-muted)]">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={btnId} className="space-y-1 px-1 pb-2">
          {children}
        </div>
      ) : null}
    </section>
  );
}
