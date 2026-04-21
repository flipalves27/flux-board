"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FluxBrandMark } from "@/components/ui/flux-brand-mark";

type LandingFooterProps = {
  localeRoot: string;
  appName: string;
  logoUrl?: string;
};

export function LandingFooter({ localeRoot, appName, logoUrl }: LandingFooterProps) {
  const t = useTranslations("landing");

  return (
    <footer className="mt-14 border-t border-[var(--flux-primary-alpha-15)] pt-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <div className="flex items-center gap-2.5">
            <FluxBrandMark platformName={appName} logoUrl={logoUrl} variant="app" />
            <span className="font-display text-sm font-bold">{appName}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--flux-text-muted)]">
            {t("footer.copyright", { year: new Date().getFullYear(), appName })}
          </p>
        </div>

        <div className="flex flex-wrap gap-8 text-xs">
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-[var(--flux-text)]">{t("footer.columnProduct")}</p>
            <a href="#platform" className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
              {t("footer.features")}
            </a>
            <a href="#pricing" className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
              {t("footer.pricing")}
            </a>
            <a href="#how-it-works" className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
              {t("nav.how")}
            </a>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-[var(--flux-text)]">{t("footer.columnPlatform")}</p>
            <Link href={`${localeRoot}/login`} className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
              {t("footer.signIn")}
            </Link>
            <a href="#faq" className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
              {t("footer.faq")}
            </a>
            <Link href={`${localeRoot}/docs`} className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
              {t("footer.docs")}
            </Link>
            <Link href={`${localeRoot}/templates`} className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
              {t("footer.templates")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
