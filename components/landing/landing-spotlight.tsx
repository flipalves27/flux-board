"use client";

import { useTranslations } from "next-intl";

export function LandingSpotlight() {
  const t = useTranslations("landing");

  const cardBase =
    "group relative overflow-hidden rounded-[12px] border border-[var(--flux-primary-alpha-10)] bg-[color-mix(in_srgb,var(--flux-surface-card)_55%,transparent)] p-6 backdrop-blur-[12px] shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--flux-primary-alpha-25)] hover:shadow-[var(--flux-shadow-lg)] md:p-7";

  return (
    <section
      id="spotlight"
      className="home-landing-reveal scroll-mt-24 py-12 md:scroll-mt-28 md:py-14"
      aria-label={t("spotlight.sectionAria")}
    >
      <p className="landing-section-badge">{t("spotlight.sectionBadge")}</p>
      <div className="mb-8 max-w-2xl md:mb-9">
        <h2 className="font-display text-[clamp(1.7rem,3.2vw,2.6rem)] font-bold leading-[1.12] tracking-[-0.02em]">{t("spotlight.heading")}</h2>
        <p className="mt-3 max-w-[560px] text-[15px] leading-[1.75] text-[var(--flux-text-muted)]">{t("spotlight.description")}</p>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2 md:gap-3.5">
        <article
          className={`${cardBase} md:col-span-2 md:grid md:grid-cols-2 md:items-center md:gap-7 md:bg-gradient-to-br md:from-[var(--flux-primary-alpha-06)] md:to-[var(--flux-secondary-alpha-04)] md:p-7`}
        >
          <div
            className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-[var(--flux-primary)]/25 blur-3xl md:hidden"
            aria-hidden
          />
          <div className="relative">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--flux-primary-alpha-20)] bg-gradient-to-br from-[var(--flux-primary-alpha-15)] to-[var(--flux-secondary-alpha-08)] py-1 pl-1 pr-2.5 font-display text-[11px] font-semibold text-[var(--flux-primary-light)]">
              <span className="text-sm" aria-hidden>
                🦊
              </span>
              {t("spotlight.copilot.fluxyBadge")}
            </div>
            <h3 className="font-display text-[1.05rem] font-semibold">{t("spotlight.copilot.title")}</h3>
            <p className="mt-2 text-[0.82rem] leading-[1.65] text-[var(--flux-text-muted)]">{t("spotlight.copilot.body")}</p>
            <div className="mt-3 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-12)] bg-[color-mix(in_srgb,black_30%,transparent)] px-3.5 py-3 font-mono text-[11px]">
              <div className="text-[10px] text-[var(--flux-text-muted)]/70">{t("spotlight.copilot.sampleLabel")}</div>
              <div className="mt-1 text-[var(--flux-secondary)]">{t("spotlight.copilot.sampleQuestion")}</div>
            </div>
          </div>
          <div className="relative mt-5 md:mt-0">
            <div className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-15)] bg-[color-mix(in_srgb,black_30%,transparent)] px-3.5 py-3 font-mono text-[11px]">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--flux-primary-alpha-20)] bg-gradient-to-br from-[var(--flux-primary-alpha-15)] to-[var(--flux-secondary-alpha-08)] py-1 pl-1 pr-2.5 font-display text-[11px] font-semibold text-[var(--flux-primary-light)]">
                <span className="text-sm" aria-hidden>
                  🦊
                </span>
                {t("spotlight.copilot.answerBadge")}
              </div>
              <p className="leading-relaxed text-[var(--flux-text-muted)]">{t("spotlight.copilot.sampleAnswer")}</p>
            </div>
          </div>
        </article>

        <article className={cardBase}>
          <div
            className="pointer-events-none absolute -left-6 -top-6 h-32 w-32 rounded-full bg-[var(--flux-secondary)]/20 blur-3xl"
            aria-hidden
          />
          <h3 className="relative font-display text-[1.05rem] font-semibold">{t("spotlight.okr.title")}</h3>
          <p className="relative mt-2 text-[0.82rem] leading-[1.65] text-[var(--flux-text-muted)]">{t("spotlight.okr.body")}</p>
          <div className="relative mt-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 font-mono text-[11px] text-[var(--flux-text-muted)]/70">{t("spotlight.okr.barObjLabel")}</span>
              <div className="h-1.5 flex-1 rounded-full bg-[color-mix(in_srgb,white_6%,transparent)]">
                <div className="h-1.5 w-[72%] rounded-full bg-gradient-to-r from-[var(--flux-primary)] to-[var(--flux-secondary)] transition-[width] duration-1000 ease-out" />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-[var(--flux-text-muted)]/70">72%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 font-mono text-[11px] text-[var(--flux-text-muted)]/70">{t("spotlight.okr.barKrLabel")}</span>
              <div className="h-1.5 flex-1 rounded-full bg-[color-mix(in_srgb,white_6%,transparent)]">
                <div className="h-1.5 w-[88%] rounded-full bg-[var(--flux-secondary)] transition-[width] duration-1000 ease-out" />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-[var(--flux-text-muted)]/70">88%</span>
            </div>
          </div>
        </article>

        <article className={cardBase}>
          <div
            className="pointer-events-none absolute bottom-0 right-[-20px] h-32 w-32 rounded-full bg-[var(--flux-accent)]/15 blur-3xl"
            aria-hidden
          />
          <h3 className="relative font-display text-[1.05rem] font-semibold">{t("spotlight.anomaly.title")}</h3>
          <p className="relative mt-2 text-[0.82rem] leading-[1.65] text-[var(--flux-text-muted)]">{t("spotlight.anomaly.body")}</p>
          <div className="relative mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--flux-accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--flux-accent)_10%,transparent)] px-2.5 py-1.5 text-[11px] text-[var(--flux-accent)]">
              <span aria-hidden>⚠</span> {t("spotlight.anomaly.alert1")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--flux-accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--flux-accent)_10%,transparent)] px-2.5 py-1.5 text-[11px] text-[var(--flux-accent)]">
              <span aria-hidden>⚠</span> {t("spotlight.anomaly.alert2")}
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}
