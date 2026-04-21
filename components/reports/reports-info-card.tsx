"use client";

import type { ReactNode } from "react";

type ReportsInfoCardProps = {
  title: string;
  value: ReactNode;
  hint?: string;
  valueClassName?: string;
};

export function ReportsInfoCard({ title, value, hint, valueClassName }: ReportsInfoCardProps) {
  return (
    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4">
      <p className="text-xs font-semibold text-[var(--flux-text)]">{title}</p>
      <p className={`mt-2 font-display text-2xl ${valueClassName ?? "text-[var(--flux-text)]"}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{hint}</p> : null}
    </div>
  );
}

