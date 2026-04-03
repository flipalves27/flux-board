"use client";

import { useTranslations } from "next-intl";
import { useSidebarLayout } from "@/context/sidebar-layout-context";
import { usePlatformDisplayName } from "@/context/org-branding-context";
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
  const platformName = usePlatformDisplayName();
  const navVariant = useNavigationVariant();
  const isMinimal = navVariant === "minimal";

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
      <span className="font-display text-sm font-bold tracking-tight text-[var(--flux-text)]">{platformName}</span>
    </header>
  );
}
