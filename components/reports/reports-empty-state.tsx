"use client";

type ReportsEmptyStateProps = {
  message: string;
};

export function ReportsEmptyState({ message }: ReportsEmptyStateProps) {
  return (
    <div className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-elevated)] px-3 py-3 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      <p className="text-sm text-[var(--flux-text-muted)]">{message}</p>
    </div>
  );
}

