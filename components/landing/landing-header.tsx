"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { FluxBrandMark } from "@/components/ui/flux-brand-mark";

type LandingHeaderProps = {
  localeRoot: string;
  appName: string;
  logoUrl?: string;
  user: unknown;
};

export function LandingHeader({ localeRoot, appName, logoUrl, user }: LandingHeaderProps) {
  const t = useTranslations("landing");
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstLink = navRef.current?.querySelector<HTMLElement>("a[href]");
    firstLink?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const navClass =
    "rounded-md px-2 py-2.5 transition-colors hover:text-[var(--flux-secondary)] md:py-1.5 min-h-[44px] md:min-h-0 flex items-center text-[13px] font-medium text-[var(--flux-text-muted)]";
  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="fixed left-0 right-0 top-0 z-[100] border-b border-[var(--flux-primary-alpha-10)] bg-[color-mix(in_srgb,var(--flux-surface-dark)_72%,transparent)] px-4 py-3.5 backdrop-blur-[28px] backdrop-saturate-150 md:px-6">
      <div className="mx-auto flex w-full max-w-[1200px] flex-nowrap items-center justify-between gap-2 md:justify-start md:gap-3 lg:gap-4 2xl:max-w-[90rem]">
        <Link href={`${localeRoot}/`} className="flex min-w-0 shrink-0 items-center gap-2.5 sm:gap-3" onClick={closeMobile}>
          <FluxBrandMark platformName={appName} logoUrl={logoUrl} variant="landing" />
          <p className="min-w-0 truncate font-display text-[1.05rem] font-bold tracking-tight text-[var(--flux-text)] sm:text-base md:text-[1.15rem]">
            {appName}
          </p>
        </Link>

        <nav
          className="mx-1 hidden min-w-0 flex-1 items-center justify-center gap-x-1 min-[900px]:flex lg:gap-x-2"
          aria-label={t("nav.mainLabel")}
        >
          <a href="#why" className={navClass}>
            {t("nav.why", { appName })}
          </a>
          <a href="#spotlight" className={navClass}>
            {t("nav.spotlight")}
          </a>
          <a href="#platform" className={navClass}>
            {t("nav.platform")}
          </a>
          <a href="#pricing" className={navClass}>
            {t("nav.pricing")}
          </a>
          <a href="#trust" className={navClass}>
            {t("nav.trust")}
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            ref={toggleRef}
            type="button"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-primary-alpha-06)] text-[var(--flux-text-muted)] shadow-[var(--flux-shadow-primary-soft)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)] md:hidden"
            aria-expanded={mobileOpen}
            aria-controls="landing-mobile-nav"
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span className="sr-only">{mobileOpen ? t("nav.closeMenu") : t("nav.openMenu")}</span>
            {mobileOpen ? <X className="h-5 w-5" strokeWidth={2} /> : <Menu className="h-5 w-5" strokeWidth={2} />}
          </button>
          {user ? (
            <Link href={`${localeRoot}/boards`} className="flux-marketing-btn-primary whitespace-nowrap">
              {t("actions.openDashboardLoggedIn")}
            </Link>
          ) : (
            <>
              <Link href={`${localeRoot}/login`} className="flux-marketing-btn-ghost hidden sm:inline-flex">
                {t("actions.signIn")}
              </Link>
              <Link href={`${localeRoot}/login`} className="flux-marketing-btn-primary whitespace-nowrap">
                {t("actions.getStarted")}
              </Link>
            </>
          )}
        </div>
      </div>

      {mobileOpen && (
        <nav
          ref={navRef}
          id="landing-mobile-nav"
          className="mx-auto mt-4 flex max-w-[1200px] flex-col gap-1 rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-18)] bg-[color-mix(in_srgb,var(--flux-surface-card)_82%,transparent)] p-3 text-sm font-semibold text-[var(--flux-text-muted)] shadow-[var(--flux-shadow-lg)] backdrop-blur-[24px] md:hidden"
          aria-label={t("nav.mainLabel")}
        >
          <a href="#why" className={`${navClass} py-2`} onClick={closeMobile}>
            {t("nav.why", { appName })}
          </a>
          <a href="#platform" className={`${navClass} py-2`} onClick={closeMobile}>
            {t("nav.platform")}
          </a>
          <a href="#spotlight" className={`${navClass} py-2`} onClick={closeMobile}>
            {t("nav.spotlight")}
          </a>
          <a href="#pricing" className={`${navClass} py-2`} onClick={closeMobile}>
            {t("nav.pricing")}
          </a>
          <a href="#how-it-works" className={`${navClass} py-2`} onClick={closeMobile}>
            {t("nav.how")}
          </a>
          <a href="#trust" className={`${navClass} py-2`} onClick={closeMobile}>
            {t("nav.trust")}
          </a>
          <a href="#faq" className={`${navClass} py-2`} onClick={closeMobile}>
            {t("footer.faq")}
          </a>
        </nav>
      )}
    </header>
  );
}
