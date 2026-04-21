"use client";

import type { ReactNode } from "react";
import { useSidebarNav } from "./sidebar-nav-context";

export function SidebarSectionTitle({
  children,
  badgeCount,
  badgeLabel,
}: {
  children: ReactNode;
  /** Pending intelligence-style items (e.g. active spec-plan runs). */
  badgeCount?: number;
  badgeLabel?: string;
}) {
  const { showExpandedNav, isMinimal } = useSidebarNav();
  if (!showExpandedNav) return null;
  const badge =
    typeof badgeCount === "number" && badgeCount > 0 ? (
      <span
        className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-14)] px-1 font-mono text-[9px] font-bold tabular-nums text-[var(--flux-primary-light)] flux-intelligence-badge-pulse"
        aria-label={badgeLabel}
      >
        {badgeCount > 99 ? "99+" : badgeCount}
      </span>
    ) : null;
  if (isMinimal) {
    return (
      <div className="px-2.5 pt-3 first:pt-1 pb-1">
        <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]/55">
          {children}
          {badge}
        </span>
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2 px-2.5 pt-3 first:mt-0 first:pt-1 pb-1">
      <span className="h-px flex-1 bg-[var(--flux-primary-alpha-12)]" aria-hidden />
      <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--flux-text-muted)]/70">
        {children}
        {badge}
      </span>
      <span className="h-px flex-1 bg-[var(--flux-primary-alpha-12)]" aria-hidden />
    </div>
  );
}
