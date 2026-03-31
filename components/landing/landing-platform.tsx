"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CAP_ICONS } from "./landing-capability-icons";

const CAPABILITY_KEYS = [
  "dailyInsights",
  "contextOnCards",
  "executiveBrief",
  "portfolioAndMetrics",
  "fluxGoals",
  "fluxForms",
  "fluxReports",
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
      <section id="platform" className="home-landing-reveal scroll-mt-24 py-12 md:scroll-mt-28 md:py-14" aria-labelledby="landing-platform-heading">
        <p className="landing-section-badge mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--flux-secondary)]">
          <span className="h-px w-5 bg-[var(--flux-secondary)]" aria-hidden />
          {t("platform.sectionBadge")}
        </p>
        <div className="mb-8 md:mb-9">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="landing-platform-heading" className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.15] tracking-[-0.02em]">
              {t("platform.heading", { appName })}
            </h2>
            {!user && (
              <Link href={`${localeRoot}/login`} className={`${platformSubtleLink} shrink-0 text-sm`}>
                {t("platform.actions.openPlatform")}
              </Link>
            )}
          </div>
          <p className="mt-3 max-w-[560px] text-[15px] leading-[1.7] text-[var(--flux-text-muted)]">{t("platform.description")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((cap) => (
            <article
              key={cap.key}
              className="tone-card landing-feature-card flex gap-3.5 rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-10)] bg-[rgba(34,31,58,0.35)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(0,210,211,0.25)] hover:bg-[rgba(34,31,58,0.55)]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(108,92,231,0.08)]">{cap.icon}</div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold">{cap.name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--flux-text-muted)]">{cap.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-landing-reveal mt-10 md:mt-12" aria-labelledby="landing-mid-cta-heading">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[rgba(34,31,58,0.5)] px-5 py-8 text-center backdrop-blur-sm md:px-8 md:py-10">
          <h2 id="landing-mid-cta-heading" className="font-display text-xl font-bold md:text-2xl">
            {t("midCta.heading", { appName })}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("midCta.description")}</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            {user ? (
              <Link href={`${localeRoot}/boards`} className="btn-primary landing-btn-shimmer px-6 py-2.5 text-sm">
                {t("midCta.primaryLoggedIn")}
              </Link>
            ) : (
              <Link href={`${localeRoot}/login`} className="btn-primary landing-btn-shimmer px-6 py-2.5 text-sm">
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
