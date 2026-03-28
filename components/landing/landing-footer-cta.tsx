"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

type LandingFooterCtaProps = {
  localeRoot: string;
  appName: string;
  user: unknown;
};

const footerPricingLink =
  "font-semibold text-[var(--flux-primary-light)] underline decoration-transparent underline-offset-4 transition-colors hover:text-[var(--flux-text)] hover:decoration-[var(--flux-primary-light)]";

export function LandingFooterCta({ localeRoot, appName, user }: LandingFooterCtaProps) {
  const t = useTranslations("landing");

  return (
    <section className="tone-cta home-landing-reveal relative mt-20 overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] px-6 py-12 text-center md:mt-24 md:px-12 md:py-16">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ background: "radial-gradient(ellipse 70% 80% at 50% 120%, var(--flux-primary-alpha-35), transparent)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-0 top-0 h-64 w-64 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--flux-secondary), transparent)" }}
        aria-hidden
      />
      <div className="relative">
        <p className="hero-chip mx-auto mb-4 inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">{t("pricing.trialNote")}</p>
        <h2 className="font-display text-2xl font-bold md:text-3xl">{t("cta.heading")}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("cta.description")}</p>
        <div className="mt-8 flex flex-col items-center gap-4">
          {user ? (
            <Link href={`${localeRoot}/boards`} className="btn-primary px-8 py-3 text-[15px]">
              {t("cta.actions.loggedIn", { appName })}
            </Link>
          ) : (
            <>
              <Link href={`${localeRoot}/login`} className="btn-primary px-8 py-3 text-[15px]">
                {t("cta.actions.loggedOutPrimary")}
              </Link>
              <a href="#pricing" className={`${footerPricingLink} text-[15px]`}>
                {t("hero.pricingLink")}
              </a>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
