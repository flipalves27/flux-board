"use client";

import type { ReactNode } from "react";

type SmartEnrichFieldShellProps = {
  active: boolean;
  onAccept: () => void;
  onReject: () => void;
  children: ReactNode;
  badge: string;
  acceptLabel: string;
  rejectLabel: string;
};

/** Borda tracejada + ações por campo para sugestões da IA no modal de card. */
export function SmartEnrichFieldShell({
  active,
  onAccept,
  onReject,
  children,
  badge,
  acceptLabel,
  rejectLabel,
}: SmartEnrichFieldShellProps) {
  if (!active) return <>{children}</>;
  return (
    <div className="rounded-xl border-2 border-dashed border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-06)] p-3 shadow-[inset_0_1px_0_0_var(--flux-chrome-alpha-04)]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-12)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
          <span aria-hidden>✨</span>
          {badge}
        </span>
        <button
          type="button"
          onClick={onAccept}
          className="rounded-lg border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-chrome-alpha-05)] px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-text)] hover:border-[var(--flux-primary-alpha-40)] hover:bg-[var(--flux-primary-alpha-10)]"
        >
          {acceptLabel}
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded-lg border border-[var(--flux-chrome-alpha-14)] bg-transparent px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)]"
        >
          {rejectLabel}
        </button>
      </div>
      {children}
    </div>
  );
}
