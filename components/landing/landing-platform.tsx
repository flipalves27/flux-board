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
      <section id="platform" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24" aria-labelledby="landing-platform-heading">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 id="landing-platform-heading" className="font-display text-2xl font-bold md:text-3xl">
              {t("platform.heading", { appName })}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--flux-text-muted)] md:text-base">{t("platform.description")}</p>
          </div>
          {!user && (
            <Link href={`${localeRoot}/login`} className="btn-secondary shrink-0 self-start md:self-auto">
              {t("platform.actions.openPlatform")}
            </Link>
          )}
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

      <section className="home-landing-reveal mt-12 md:mt-14" aria-labelledby="landing-mid-cta-heading">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)]/80 px-6 py-8 text-center backdrop-blur-sm md:px-10 md:py-10">
          <h2 id="landing-mid-cta-heading" className="font-display text-xl font-bold md:text-2xl">
            {t("midCta.heading", { appName })}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("midCta.description")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {user ? (
              <Link href={`${localeRoot}/boards`} className="btn-primary px-6 py-2.5 text-sm">
                {t("midCta.primaryLoggedIn")}
              </Link>
            ) : (
              <Link href={`${localeRoot}/login`} className="btn-primary px-6 py-2.5 text-sm">
                {t("midCta.primaryLoggedOut")}
              </Link>
            )}
            <a href="#pricing" className="btn-secondary px-6 py-2.5 text-sm">
              {t("midCta.secondary")}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
