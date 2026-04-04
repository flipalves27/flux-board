"use client";

import type { ReactNode } from "react";

type ReportsKpiTone = "primary" | "secondary" | "neutral" | "amber";

type ReportsKpiCardProps = {
  label: string;
  value: ReactNode;
  tone?: ReportsKpiTone;
  hover?: boolean;
};

const KPI_TONE_STYLES: Record<ReportsKpiTone, string> = {
  primary: "border-[var(--flux-primary-alpha-22)]",
  secondary: "border-[var(--flux-secondary-alpha-28)]",
  neutral: "border-[var(--flux-chrome-alpha-10)]",
  amber: "border-[var(--flux-amber-alpha-28)]",
};

const KPI_HOVER_STYLES: Record<ReportsKpiTone, string> = {
  primary: "motion-safe:hover:shadow-[0_10px_28px_var(--flux-primary-alpha-12)]",
  secondary: "motion-safe:hover:shadow-[0_10px_28px_var(--flux-secondary-alpha-12)]",
  neutral: "motion-safe:hover:shadow-[0_10px_28px_var(--flux-chrome-alpha-10)]",
  amber: "motion-safe:hover:shadow-[0_10px_28px_var(--flux-amber-alpha-12)]",
};

export function ReportsKpiCard({ label, value, tone = "neutral", hover = false }: ReportsKpiCardProps) {
  return (
    <div
      className={`rounded-[var(--flux-rad)] border bg-[var(--flux-surface-card)] p-4 transition-all duration-200 ${
        KPI_TONE_STYLES[tone]
      } ${hover ? `motion-safe:hover:-translate-y-0.5 ${KPI_HOVER_STYLES[tone]}` : ""}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{label}</p>
      <p className="mt-1 font-display text-2xl text-[var(--flux-text)]">{value}</p>
    </div>
  );
}

