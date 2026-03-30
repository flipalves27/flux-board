"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CAP_ICONS } from "./landing-capability-icons";

const CAPABILITY_KEYS = [
  "dailyInsights",
  "contextOnCards",
  "executiveBrief",
  "portfolioAndMetrics",
  "discoveryAndDeals",
  "routinesAndAlerts",
] as const;

type LandingPlatformProps = {
  localeRoot: string;
  appName: string;
  user: unknown;
};

const platformSubtleLink =
  "font-semibold text-[var(--flux-primary-light)] underline decoration-transparent underline-offset-4 transition-colors hover:text-[var(--flux-text)] hover:decoration-[var(--flux-primary-light)]";

export function LandingPlatform({ localeRoot, appName, user }: LandingPlatformProps) {
  const t = useTranslations("landing");
  const capabilities = CAPABILITY_KEYS.map((key) => ({
    key,
    name: t(`capabilities.${key}.name`),
    detail: t(`capabilities.${key}.detail`),
    icon: CAP_ICONS[key],
  }));

  return (
    <>
      <section id="platform" className="home-landing-reveal mt-12 scroll-mt-24 md:mt-16" aria-labelledby="landing-platform-heading">
        <div className="mb-5 md:mb-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="landing-platform-heading" className="font-display text-2xl font-bold md:text-3xl">
              {t("platform.heading", { appName })}
            </h2>
            {!user && (
              <Link href={`${localeRoot}/login`} className={`${platformSubtleLink} shrink-0 text-sm`}>
                {t("platform.actions.openPlatform")}
              </Link>
            )}
          </div>
          <p className="mt-2 max-w-xl text-sm text-[var(--flux-text-muted)] md:text-base">{t("platform.description")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((cap) => (
            <article
              key={cap.key}
              className="tone-card flex flex-col rounded-[var(--flux-rad-lg)] border bg-[var(--flux-surface-card)] p-5 shadow-[var(--shadow-md)] transition-colors hover:border-[var(--flux-secondary-alpha-35)]"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--flux-surface-elevated)]">{cap.icon}</div>
                <h3 className="font-display text-base font-semibold">{cap.name}</h3>
              </div>
              <p className="flex-1 text-sm leading-relaxed text-[var(--flux-text-muted)]">{cap.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-landing-reveal mt-8 md:mt-10" aria-labelledby="landing-mid-cta-heading">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)]/80 px-5 py-6 text-center backdrop-blur-sm md:px-8 md:py-8">
          <h2 id="landing-mid-cta-heading" className="font-display text-xl font-bold md:text-2xl">
            {t("midCta.heading", { appName })}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("midCta.description")}</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            {user ? (
              <Link href={`${localeRoot}/boards`} className="btn-primary px-6 py-2.5 text-sm">
                {t("midCta.primaryLoggedIn")}
              </Link>
            ) : (
              <Link href={`${localeRoot}/login`} className="btn-primary px-6 py-2.5 text-sm">
                {t("midCta.primaryLoggedOut")}
              </Link>
            )}
            <a href="#pricing" className={`${platformSubtleLink} text-center text-[15px]`}>
              {t("midCta.secondary")}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
