"use client";

import { useTranslations } from "next-intl";

export function LandingSpotlight() {
  const t = useTranslations("landing");

  return (
    <section
      id="spotlight"
      className="home-landing-reveal scroll-mt-24 py-12 md:scroll-mt-28 md:py-14"
      aria-label={t("spotlight.sectionAria")}
    >
      <p className="landing-section-badge mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--flux-secondary)]">
        <span className="h-px w-5 bg-[var(--flux-secondary)]" aria-hidden />
        {t("spotlight.sectionBadge")}
      </p>
      <div className="mb-8 max-w-2xl md:mb-9">
        <h2 className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.15] tracking-[-0.02em]">{t("spotlight.heading")}</h2>
        <p className="mt-3 max-w-[560px] text-[15px] leading-[1.7] text-[var(--flux-text-muted)]">{t("spotlight.description")}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <article className="landing-spotlight-card group relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-15)] bg-[color-mix(in_srgb,var(--flux-surface-card)_50%,transparent)] p-7 shadow-[var(--shadow-md)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--flux-primary-alpha-30)] hover:shadow-[var(--flux-shadow-lg)]">
          <div
            className="landing-spotlight-card-glow pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-[var(--flux-primary)]/30 blur-3xl"
            aria-hidden
          />
          <div className="relative mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--flux-primary)] to-[var(--flux-primary-dark)]">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
              <path d="M4 10h3l2-5 2 9 2-4h3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="relative font-display text-[17px] font-semibold">{t("spotlight.copilot.title")}</h3>
          <p className="relative mt-2 text-[13px] leading-[1.7] text-[var(--flux-text-muted)]">{t("spotlight.copilot.body")}</p>
          <div className="relative mt-4 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-12)] bg-[color-mix(in_srgb,var(--flux-surface-dark)_40%,transparent)] px-3.5 py-3 text-xs">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="shrink-0 text-[11px] font-semibold text-[var(--flux-secondary)]">{t("spotlight.copilot.sampleLabel")}</span>
              <span className="home-copilot-typewriter block min-w-0 max-w-full text-[var(--flux-text-muted)]">{t("spotlight.copilot.sampleQuestion")}</span>
            </div>
          </div>
        </article>

        <article className="landing-spotlight-card group relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-15)] bg-[color-mix(in_srgb,var(--flux-surface-card)_50%,transparent)] p-7 shadow-[var(--shadow-md)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--flux-primary-alpha-30)] hover:shadow-[var(--flux-shadow-lg)]">
          <div
            className="landing-spotlight-card-glow pointer-events-none absolute -left-6 -top-6 h-32 w-32 rounded-full bg-[var(--flux-secondary)]/20 blur-3xl"
            aria-hidden
          />
          <div className="relative mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--flux-secondary-dark)] to-[var(--flux-secondary)]">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
              <circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.4" strokeOpacity="0.6" />
              <circle cx="10" cy="10" r="4" stroke="white" strokeWidth="1.4" />
              <circle cx="10" cy="10" r="1.5" fill="white" />
            </svg>
          </div>
          <h3 className="relative font-display text-[17px] font-semibold">{t("spotlight.okr.title")}</h3>
          <p className="relative mt-2 text-[13px] leading-[1.7] text-[var(--flux-text-muted)]">{t("spotlight.okr.body")}</p>
          <div className="relative mt-4 space-y-3 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-12)] bg-[color-mix(in_srgb,var(--flux-surface-dark)_40%,transparent)] px-3.5 py-3 text-xs">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--flux-text-muted)]">{t("spotlight.okr.demoObjective")}</span>
                <span className="text-xs font-bold text-[var(--flux-secondary)]">72%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--flux-secondary-alpha-10)]">
                <div className="h-1.5 w-[72%] rounded-full bg-[var(--flux-secondary)] transition-[width] duration-1000 ease-out" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--flux-text-muted)]">{t("spotlight.okr.demoKr")}</span>
                <span className="text-xs font-bold text-[var(--flux-secondary-light)]">88%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--flux-secondary-alpha-10)]">
                <div className="h-1.5 w-[88%] rounded-full bg-[var(--flux-secondary-light)] transition-[width] duration-1000 ease-out" />
              </div>
            </div>
          </div>
        </article>

        <article className="landing-spotlight-card group relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-15)] bg-[color-mix(in_srgb,var(--flux-surface-card)_50%,transparent)] p-7 shadow-[var(--shadow-md)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--flux-primary-alpha-30)] hover:shadow-[var(--flux-shadow-lg)]">
          <div
            className="landing-spotlight-card-glow pointer-events-none absolute bottom-0 right-[-20px] h-32 w-32 rounded-full bg-[var(--flux-danger-alpha-15)] blur-3xl"
            aria-hidden
          />
          <div className="relative mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--flux-danger)] to-[var(--flux-warning)]">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
              <path d="M10 3l7 12H3L10 3z" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M10 9v3M10 14v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h3 className="relative font-display text-[17px] font-semibold">{t("spotlight.anomaly.title")}</h3>
          <p className="relative mt-2 text-[13px] leading-[1.7] text-[var(--flux-text-muted)]">{t("spotlight.anomaly.body")}</p>
          <div className="relative mt-4 space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-[var(--flux-danger-alpha-12)] bg-[var(--flux-danger-alpha-06)] px-3 py-2 text-[11px] font-medium">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--flux-warning)]" aria-hidden />
              <span className="text-[var(--flux-warning)]">{t("spotlight.anomaly.alert1")}</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-[var(--flux-danger-alpha-12)] bg-[var(--flux-danger-alpha-06)] px-3 py-2 text-[11px] font-medium">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--flux-danger)]" aria-hidden />
              <span className="text-[var(--flux-danger)]">{t("spotlight.anomaly.alert2")}</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
