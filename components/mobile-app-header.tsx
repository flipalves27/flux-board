"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useSidebarLayout } from "@/context/sidebar-layout-context";
import { useOrgBranding, usePlatformDisplayName } from "@/context/org-branding-context";
import { FluxBrandMark } from "@/components/ui/flux-brand-mark";
import { useNavigationVariant } from "@/context/navigation-variant-context";

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/** Sticky top bar with hamburger — only when layout is mobile (< 768px). */
export function MobileAppHeader() {
  const { layout, mobileOpen, openMobile } = useSidebarLayout();
  const t = useTranslations("navigation.menu");
  const tCommand = useTranslations("commandPalette");
  const platformName = usePlatformDisplayName();
  const orgLogoUrl = useOrgBranding()?.effectiveBranding?.logoUrl?.trim();
  const navVariant = useNavigationVariant();
  const isMinimal = navVariant === "minimal";

  const openCommand = useCallback(() => {
    window.dispatchEvent(new CustomEvent("flux-open-command-palette"));
  }, []);

  if (layout !== "mobile") return null;

  return (
    <header
      className={`flux-mobile-header-bar sticky top-0 z-[var(--flux-z-mobile-header)] flex min-h-12 shrink-0 items-center gap-2 border-b border-[var(--flux-border-subtle)] px-3 pt-[env(safe-area-inset-top,0px)] md:hidden ${
        isMinimal
          ? "bg-[color-mix(in_srgb,var(--flux-surface-dark)_88%,transparent)]"
          : "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--flux-surface-dark)_92%,transparent),color-mix(in_srgb,var(--flux-surface-dark)_82%,var(--flux-primary)_18%))]"
      }`}
    >
      <button
        type="button"
        onClick={openMobile}
        className="flex h-10 w-10 items-center justify-center rounded-[var(--flux-rad-sm)] border border-transparent text-[var(--flux-text)] transition-all duration-200 hover:border-[var(--flux-primary-alpha-12)] hover:bg-[var(--flux-primary-alpha-08)]"
        aria-label={t("openNavigation")}
        aria-haspopup="dialog"
        aria-expanded={mobileOpen}
      >
        <IconMenu className="h-5 w-5" />
      </button>
      <FluxBrandMark platformName={platformName} logoUrl={orgLogoUrl} variant="mobile" className="shrink-0" />
      <span className="min-w-0 flex-1 truncate font-display text-sm font-bold tracking-tight text-[var(--flux-text)]">{platformName}</span>
      <button
        type="button"
        onClick={openCommand}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--flux-rad-sm)] border border-transparent text-[var(--flux-text-muted)] transition-colors hover:border-[var(--flux-primary-alpha-12)] hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]"
        aria-label={tCommand("openFromMobileHeader")}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    </header>
  );
}
