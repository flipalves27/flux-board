"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

type LandingTrustProps = {
  localeRoot: string;
};

export function LandingTrust({ localeRoot }: LandingTrustProps) {
  const t = useTranslations("landing");
  const bullets = [t("trust.bullet1"), t("trust.bullet2"), t("trust.bullet3")];

  return (
    <section id="trust" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24" aria-labelledby="landing-trust-heading">
      <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-18)] bg-[var(--flux-surface-card)]/90 p-6 backdrop-blur-sm md:p-8">
        <h2 id="landing-trust-heading" className="font-display text-2xl font-bold md:text-3xl">
          {t("trust.heading")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("trust.intro")}</p>
        <ul className="mt-5 list-inside list-disc space-y-2 text-sm text-[var(--flux-text-muted)] md:list-outside md:pl-5">
          {bullets.map((b) => (
            <li key={b} className="leading-relaxed">
              {b}
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <Link href={`${localeRoot}/docs`} className="btn-secondary inline-flex px-5 py-2.5 text-sm">
            {t("trust.docsCta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
