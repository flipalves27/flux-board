"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon, FluxLogoIcon, MenuIcon } from "./landing-icons";

type LandingHeaderProps = {
  localeRoot: string;
  appName: string;
  logoUrl?: string;
  user: unknown;
};

export function LandingHeader({ localeRoot, appName, logoUrl, user }: LandingHeaderProps) {
  const t = useTranslations("landing");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const navClass = "rounded-md px-2 py-1 transition-colors hover:text-[var(--flux-text)]";
  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="hero-shell home-landing-reveal sticky top-4 z-20 rounded-[var(--flux-rad-xl)] border px-4 py-3 backdrop-blur-md md:px-5 md:py-3.5">
      <div className="flex w-full flex-nowrap items-center justify-between gap-2 md:justify-start md:gap-3 lg:gap-4">
        <Link href={`${localeRoot}/`} className="flex min-w-0 shrink-0 items-center gap-2.5 sm:gap-3" onClick={closeMobile}>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] overflow-hidden"
            style={{
              background: logoUrl
                ? "var(--flux-surface-elevated)"
                : "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
              boxShadow: logoUrl ? "none" : "0 8px 20px var(--flux-primary-alpha-35)",
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="max-h-9 max-w-[36px] object-contain" />
            ) : (
              <FluxLogoIcon className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 text-left">
            <p className="font-display text-base font-bold tracking-tight">{appName}</p>
            <p className="truncate text-xs text-[var(--flux-text-muted)]">{t("header.tagline")}</p>
          </div>
        </Link>

        <nav
          className="mx-1 hidden min-w-0 flex-1 items-center justify-center gap-x-2 gap-y-1 text-[13px] font-semibold text-[var(--flux-text-muted)] md:flex lg:gap-x-3 lg:text-sm"
          aria-label={t("nav.mainLabel")}
        >
          <a href="#why" className={navClass}>
            {t("nav.why", { appName })}
          </a>
          <a href="#platform" className={navClass}>
            {t("nav.platform")}
          </a>
          <a href="#spotlight" className={navClass}>
            {t("nav.spotlight")}
          </a>
          <a href="#pricing" className={navClass}>
            {t("nav.pricing")}
          </a>
          <a href="#how-it-works" className={navClass}>
            {t("nav.how")}
          </a>
          <a href="#trust" className={navClass}>
            {t("nav.trust")}
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] text-[var(--flux-text-muted)] md:hidden"
            aria-expanded={mobileOpen}
            aria-controls="landing-mobile-nav"
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span className="sr-only">{mobileOpen ? t("nav.closeMenu") : t("nav.openMenu")}</span>
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
          {user ? (
            <Link href={`${localeRoot}/boards`} className="btn-primary whitespace-nowrap px-3.5 py-2 text-sm sm:px-4 sm:py-2.5 sm:text-[15px]">
              {t("actions.openDashboardLoggedIn")}
            </Link>
          ) : (
            <>
              <Link
                href={`${localeRoot}/login`}
                className="btn-ghost hidden px-3 py-2 text-sm sm:inline-flex sm:px-3.5 sm:text-[15px]"
              >
                {t("actions.signIn")}
              </Link>
              <Link href={`${localeRoot}/login`} className="btn-primary whitespace-nowrap px-3.5 py-2 text-sm sm:px-5 sm:py-2.5 sm:text-[15px]">
                {t("actions.getStarted")}
              </Link>
            </>
          )}
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="landing-mobile-nav"
          className="mt-4 flex flex-col gap-1 border-t border-[var(--flux-primary-alpha-15)] pt-4 text-sm font-semibold text-[var(--flux-text-muted)] md:hidden"
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
