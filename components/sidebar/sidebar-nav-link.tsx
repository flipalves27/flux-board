"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { bumpSidebarNavFreq } from "@/lib/sidebar-nav-frequency";
import { useSidebarNav } from "./sidebar-nav-context";

export type SidebarNavLinkProps = {
  path: string;
  icon: ReactNode;
  label: ReactNode;
  hint: string;
  sublabel?: string;
  dataTour?: string;
  /** When set, overrides `isActive(path)` (e.g. Copilot → /boards must not highlight with Boards). */
  isActiveOverride?: boolean;
  /** Pulsing dot when análise spec-plan está em segundo plano. */
  badgeDot?: boolean;
  badgeCount?: number;
  badgeTone?: "neutral" | "attention" | "danger" | "ai";
  /** When set, increments local frequency for adaptive ordering (Intelligence section). */
  trackPath?: string;
};

export function SidebarNavLink({
  path,
  icon,
  label,
  hint,
  sublabel,
  dataTour,
  isActiveOverride,
  badgeDot,
  badgeCount,
  badgeTone = "neutral",
  trackPath,
}: SidebarNavLinkProps) {
  const { locale, layout, compactMode, isMinimal, closeMobile, isActive, showExpandedNav } = useSidebarNav();
  const href = `/${locale}${path}`;
  const activePath = trackPath ?? path.split("?")[0];
  const navActive = isActiveOverride ?? isActive(activePath);
  const itemClass = isMinimal
    ? `relative flex items-center gap-2.5 w-full pl-3 pr-2.5 py-2 rounded-r-[var(--flux-rad-sm)] border-y-0 border-r-0 border-l-2 font-semibold text-sm transition-all duration-200 ease-out font-display overflow-hidden
         ${navActive
           ? "border-l-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)]"
           : "border-l-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-05)] hover:text-[var(--flux-text)]"
         }`
    : `relative flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--flux-rad-sm)] border font-semibold text-sm transition-all duration-200 ease-out font-display overflow-hidden
         ${navActive
           ? "border-[var(--flux-primary-alpha-25)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-20),var(--flux-primary-alpha-10))] text-[var(--flux-primary-light)] shadow-[0_6px_20px_var(--flux-primary-alpha-12)]"
           : "border-transparent text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-12)] hover:bg-[var(--flux-primary-alpha-06)] hover:text-[var(--flux-text)]"
         }`;
  const afterNav = () => {
    if (layout === "mobile") closeMobile();
  };
  const body = (
    <Link
      href={href}
      onClick={() => {
        if (trackPath) bumpSidebarNavFreq(trackPath);
        afterNav();
      }}
      data-tour={dataTour}
      className={`relative ${itemClass} ${showExpandedNav && sublabel ? "items-start py-2.5" : ""}`}
    >
      {badgeDot ? (
        <span
          className="absolute right-2 top-2 h-2 w-2 shrink-0 rounded-full bg-[var(--flux-accent)] shadow-[0_0_8px_var(--flux-accent)] motion-safe:animate-pulse"
          title=""
          aria-hidden
        />
      ) : null}
      {!isMinimal ? (
        <span
          className={`absolute left-1.5 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full transition-opacity duration-200 ${
            navActive ? "bg-[var(--flux-primary-light)] opacity-100" : "bg-[var(--flux-primary)] opacity-0"
          }`}
          aria-hidden
        />
      ) : null}
      <span className="mt-0.5 shrink-0">{icon}</span>
      {showExpandedNav && (
        <span className="flex min-w-0 flex-1 flex-col gap-0 leading-tight">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{label}</span>
            {badgeCount != null && badgeCount > 0 ? (
              <span
                className="flux-badge ml-auto px-1.5 py-0 text-[9px]"
                data-tone={badgeTone === "neutral" ? undefined : badgeTone}
                aria-label={`${badgeCount}`}
              >
                {badgeCount}
              </span>
            ) : null}
          </span>
          {sublabel ? (
            <span className="text-[10px] font-medium text-[var(--flux-text-muted)]/90">{sublabel}</span>
          ) : null}
        </span>
      )}
    </Link>
  );
  if (compactMode) {
    return (
      <CustomTooltip content={hint} position="right">
        {body}
      </CustomTooltip>
    );
  }
  return body;
}
