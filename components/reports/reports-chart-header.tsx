"use client";

import type { ReactNode } from "react";

type ReportsChartHeaderProps = {
  title: string;
  hint?: string;
  action?: ReactNode;
};

export function ReportsChartHeader({ title, hint, action }: ReportsChartHeaderProps) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{title}</h3>
        {hint ? <p className="mt-1 text-[11px] leading-relaxed text-[var(--flux-text-muted)]">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

