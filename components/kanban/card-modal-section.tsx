"use client";

import type { ReactNode } from "react";

export const inputBase =
  "w-full px-4 py-3 border border-[var(--flux-chrome-alpha-12)] rounded-xl text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] transition-all duration-200 outline-none focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[var(--flux-primary-alpha-25)] hover:border-[var(--flux-chrome-alpha-20)]";

const sectionShell =
  "rounded-2xl border border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-gradient-panel-sheen)] p-5 shadow-[var(--flux-shadow-inset-panel-top)] transition-[border-color,box-shadow] duration-300 ease-out hover:border-[var(--flux-primary-alpha-20)] hover:shadow-[var(--flux-shadow-panel-hover)]";

export function CardModalSection({
  title,
  description,
  headerRight,
  children,
}: {
  title: string;
  description?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={sectionShell}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
            {title}
          </h3>
          {description ? (
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--flux-text-muted)]/90">{description}</p>
          ) : null}
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
