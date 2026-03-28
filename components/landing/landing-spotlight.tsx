"use client";

import { useTranslations } from "next-intl";

export function LandingSpotlight() {
  const t = useTranslations("landing");

  return (
    <section className="home-landing-reveal mt-20 md:mt-24" aria-label={t("spotlight.sectionAria")}>
      <div className="grid gap-5 md:grid-cols-3">
        <article className="relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] p-6">
          <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-[var(--flux-primary)]/20 blur-3xl" aria-hidden />
          <div className="relative mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--flux-primary)] to-[var(--flux-primary-dark)]">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
              <path d="M4 10h3l2-5 2 9 2-4h3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="relative font-display text-lg font-semibold">{t("spotlight.copilot.title")}</h3>
          <p className="relative mt-2 text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("spotlight.copilot.body")}</p>
          <div className="relative mt-4 rounded-lg border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-dark)]/50 px-3 py-2.5 text-xs text-[var(--flux-text-muted)]/80">
            <span className="text-[var(--flux-secondary)]">{t("spotlight.copilot.sampleLabel")}</span>
            {t("spotlight.copilot.sampleQuestion")}
          </div>
        </article>

        <article className="relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-secondary-alpha-20)] bg-[var(--flux-surface-card)] p-6">
          <div className="pointer-events-none absolute -left-6 -top-6 h-32 w-32 rounded-full bg-[var(--flux-secondary)]/15 blur-3xl" aria-hidden />
          <div className="relative mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--flux-secondary-dark)] to-[var(--flux-secondary)]">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
              <circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.4" strokeOpacity="0.6" />
              <circle cx="10" cy="10" r="4" stroke="white" strokeWidth="1.4" />
              <circle cx="10" cy="10" r="1.5" fill="white" />
            </svg>
          </div>
          <h3 className="relative font-display text-lg font-semibold">{t("spotlight.okr.title")}</h3>
          <p className="relative mt-2 text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("spotlight.okr.body")}</p>
          <div className="relative mt-4 grid grid-cols-2 gap-2">
            {[
              { label: t("spotlight.okr.demoObjective"), pct: 72 },
              { label: t("spotlight.okr.demoKr"), pct: 88 },
            ].map((okr) => (
              <div key={okr.label} className="rounded-md border border-[var(--flux-secondary-alpha-15)] bg-[var(--flux-surface-dark)]/50 px-2.5 py-2">
                <p className="text-[10px] font-semibold text-[var(--flux-text-muted)]">{okr.label}</p>
                <div className="mt-1.5 h-1 w-full rounded-full bg-[var(--flux-secondary-alpha-15)]">
                  <div className="h-1 rounded-full bg-[var(--flux-secondary)]" style={{ width: `${okr.pct}%` }} />
                </div>
                <p className="mt-1 text-[10px] font-bold text-[var(--flux-secondary)]">{okr.pct}%</p>
              </div>
            ))}
          </div>
        </article>

        <article className="relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-danger)]/20 bg-[var(--flux-surface-card)] p-6">
          <div className="pointer-events-none absolute -right-6 bottom-0 h-32 w-32 rounded-full bg-[var(--flux-danger)]/10 blur-3xl" aria-hidden />
          <div className="relative mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--flux-danger)] to-[var(--flux-warning)]">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
              <path d="M10 3l7 12H3L10 3z" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M10 9v3M10 14v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h3 className="relative font-display text-lg font-semibold">{t("spotlight.anomaly.title")}</h3>
          <p className="relative mt-2 text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("spotlight.anomaly.body")}</p>
          <div className="relative mt-4 space-y-1.5">
            <div className="flex items-center gap-2 rounded-md border border-[var(--flux-danger)]/12 bg-[var(--flux-surface-dark)]/50 px-2.5 py-1.5 text-xs">
              <span className="text-[var(--flux-warning)]" aria-hidden>
                !
              </span>
              <span className="font-medium text-[var(--flux-warning)]">{t("spotlight.anomaly.alert1")}</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-[var(--flux-danger)]/12 bg-[var(--flux-surface-dark)]/50 px-2.5 py-1.5 text-xs">
              <span className="text-[var(--flux-danger)]" aria-hidden>
                !
              </span>
              <span className="font-medium text-[var(--flux-danger)]">{t("spotlight.anomaly.alert2")}</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
