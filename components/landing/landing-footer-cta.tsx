"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

type LandingFooterCtaProps = {
  localeRoot: string;
  appName: string;
  user: unknown;
};

const footerPricingLink = "flux-marketing-btn-ghost inline-flex items-center justify-center";

export function LandingFooterCta({ localeRoot, appName, user }: LandingFooterCtaProps) {
  const t = useTranslations("landing");

  return (
    <section className="home-landing-reveal relative py-12 md:py-14" aria-labelledby="landing-footer-cta-heading">
      <div className="relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[color-mix(in_srgb,var(--flux-surface-card)_60%,transparent)] px-6 py-14 text-center backdrop-blur-sm md:px-10 md:py-14">
        <div
          className="pointer-events-none absolute bottom-[-40%] left-1/2 h-[200px] w-[80%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,var(--flux-primary-alpha-25),transparent_70%)] blur-[60px]"
          aria-hidden
        />
        <div className="relative">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--flux-secondary)]">{t("cta.trialChip")}</p>
          <h2 id="landing-footer-cta-heading" className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.15] tracking-[-0.02em]">
            {t("cta.heading")}
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-[1.7] text-[var(--flux-text-muted)]">{t("cta.description")}</p>
          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
            {user ? (
              <Link href={`${localeRoot}/boards`} className="flux-marketing-btn-primary">
                {t("cta.actions.loggedIn", { appName })}
              </Link>
            ) : (
              <>
                <Link href={`${localeRoot}/login`} className="flux-marketing-btn-primary landing-btn-shimmer">
                  {t("cta.actions.loggedOutPrimary")}
                </Link>
                <a href="#pricing" className={footerPricingLink}>
                  {t("cta.pricingAnchor")}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
