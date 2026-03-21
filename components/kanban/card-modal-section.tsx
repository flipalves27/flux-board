"use client";

import type { ReactNode } from "react";

export const inputBase =
  "w-full px-4 py-3 border border-[rgba(255,255,255,0.12)] rounded-xl text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] transition-all duration-200 outline-none focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[rgba(108,92,231,0.25)] hover:border-[rgba(255,255,255,0.2)]";

const sectionShell =
  "rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[linear-gradient(148deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.02)_45%,rgba(0,0,0,0.08)_100%)] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-[border-color,box-shadow] duration-300 ease-out hover:border-[rgba(108,92,231,0.2)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_16px_48px_-20px_rgba(0,0,0,0.5)]";

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
