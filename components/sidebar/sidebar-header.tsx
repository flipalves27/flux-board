"use client";

import Link from "next/link";
import { FluxLogoIcon, IconChevronLeft, IconChevronRight, IconClose } from "./icons";
import type { SidebarLayoutMode } from "./sidebar-nav-context";

export type SidebarHeaderProps = {
  locale: string;
  layout: SidebarLayoutMode;
  orgLogoUrl?: string;
  platformName: string;
  showExpandedNav: boolean;
  compactMode: boolean;
  isMinimal: boolean;
  collapsed: boolean;
  closeMobile: () => void;
  toggleDesktopCollapsed: () => void;
  expandLabel: string;
  collapseLabel: string;
  closeNavLabel: string;
};

export function SidebarHeader({
  locale,
  layout,
  orgLogoUrl,
  platformName,
  showExpandedNav,
  compactMode,
  isMinimal,
  collapsed,
  closeMobile,
  toggleDesktopCollapsed,
  expandLabel,
  collapseLabel,
  closeNavLabel,
}: SidebarHeaderProps) {
  return (
    <div
      className={`flex h-12 shrink-0 items-center gap-1.5 border-b px-2.5 ${
        isMinimal ? "border-[var(--flux-chrome-alpha-08)]" : "border-[var(--flux-primary-alpha-08)]"
      } ${compactMode ? "justify-center" : "justify-between"}`}
    >
      <Link
        href={`/${locale}/boards`}
        onClick={() => layout === "mobile" && closeMobile()}
        className={`flex min-w-0 items-center ${compactMode ? "shrink-0 justify-center" : "gap-2"}`}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[var(--flux-rad-sm)] text-white"
          style={{
            background: orgLogoUrl
              ? "var(--flux-surface-elevated)"
              : "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
            boxShadow: orgLogoUrl ? "none" : "0 2px 8px var(--flux-primary-alpha-25)",
          }}
        >
          {orgLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={orgLogoUrl} alt="" className="max-h-[28px] max-w-[28px] object-contain" />
          ) : (
            <FluxLogoIcon className="h-4 w-4" />
          )}
        </div>
        {showExpandedNav && (
          <span className="truncate font-display text-sm font-bold text-[var(--flux-text)]">{platformName}</span>
        )}
      </Link>
      {layout === "desktop" ? (
        <button
          type="button"
          onClick={toggleDesktopCollapsed}
          className="shrink-0 rounded-[var(--flux-rad-sm)] p-1.5 text-[var(--flux-text-muted)] transition-colors hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]"
          aria-label={collapsed ? expandLabel : collapseLabel}
        >
          {collapsed ? <IconChevronRight className="h-4 w-4" /> : <IconChevronLeft className="h-4 w-4" />}
        </button>
      ) : layout === "mobile" ? (
        <button
          type="button"
          onClick={closeMobile}
          className="shrink-0 rounded-[var(--flux-rad-sm)] p-1.5 text-[var(--flux-text-muted)] transition-colors hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]"
          aria-label={closeNavLabel}
        >
          <IconClose className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
