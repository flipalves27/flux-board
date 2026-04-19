"use client";

import { useTranslations } from "next-intl";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";

export function LandingSpotlight() {
  const t = useTranslations("landing");

  const cardBase =
    "group relative overflow-hidden rounded-[16px] border border-[var(--flux-primary-alpha-10)] bg-[color-mix(in_srgb,var(--flux-surface-card)_55%,transparent)] p-6 backdrop-blur-[14px] shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--flux-primary-alpha-25)] hover:shadow-[var(--flux-shadow-lg)] md:p-7";

  return (
    <section
      id="spotlight"
      className="home-landing-reveal scroll-mt-24 py-14 md:scroll-mt-28 md:py-16"
      aria-label={t("spotlight.sectionAria")}
    >
      <p className="landing-section-badge">{t("spotlight.sectionBadge")}</p>
      <div className="mb-10 max-w-2xl md:mb-12">
        <h2 className="font-display text-[clamp(1.75rem,3.4vw,2.7rem)] font-bold leading-[1.1] tracking-[-0.025em]">
          {t("spotlight.heading")}
        </h2>
        <p className="mt-3 max-w-[560px] text-[15px] leading-[1.75] text-[var(--flux-text-muted)]">{t("spotlight.description")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-4">
        <article
          className={`${cardBase} landing-spotlight-hero md:col-span-2 md:grid md:grid-cols-2 md:items-center md:gap-7 md:bg-gradient-to-br md:from-[var(--flux-primary-alpha-08)] md:to-[var(--flux-secondary-alpha-06)] md:p-8`}
        >
          <span
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            aria-hidden
            style={{
              background:
                "radial-gradient(600px circle at var(--mouse-x,50%) var(--mouse-y,0%), color-mix(in srgb, var(--flux-primary) 14%, transparent), transparent 40%)",
            }}
          />
          <div
            className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-[var(--flux-primary)]/25 blur-3xl md:hidden"
            aria-hidden
          />
          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--flux-primary-alpha-20)] bg-gradient-to-br from-[var(--flux-primary-alpha-15)] to-[var(--flux-secondary-alpha-08)] py-1 pl-1 pr-2.5 font-display text-[11px] font-semibold text-[var(--flux-primary-light)]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-md" aria-hidden>
                <FluxyAvatar state="idle" size="fab" />
              </span>
              {t("spotlight.copilot.fluxyBadge")}
            </div>
            <h3 className="font-display text-[1.15rem] font-semibold tracking-[-0.01em] md:text-[1.25rem]">{t("spotlight.copilot.title")}</h3>
            <p className="mt-2.5 text-[0.88rem] leading-[1.7] text-[var(--flux-text-muted)]">{t("spotlight.copilot.body")}</p>
            <div className="landing-ai-prompt mt-4 rounded-[12px] border border-[var(--flux-primary-alpha-12)] bg-[color-mix(in_srgb,black_30%,transparent)] px-3.5 py-3 font-mono text-[11.5px] shadow-[inset_0_1px_0_color-mix(in_srgb,white_5%,transparent)]">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--flux-text-muted)]/70">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--flux-secondary)]" aria-hidden />
                {t("spotlight.copilot.sampleLabel")}
              </div>
              <div className="mt-1 text-[var(--flux-secondary)]">
                {t("spotlight.copilot.sampleQuestion")}
                <span className="landing-ai-cursor ml-0.5 inline-block h-3 w-[6px] translate-y-[1px] bg-[var(--flux-secondary)]" aria-hidden />
              </div>
            </div>
          </div>
          <div className="relative mt-5 md:mt-0">
            <div className="landing-ai-response rounded-[12px] border border-[var(--flux-secondary-alpha-15)] bg-[color-mix(in_srgb,black_32%,transparent)] px-3.5 py-3 font-mono text-[11.5px] shadow-[inset_0_1px_0_color-mix(in_srgb,white_5%,transparent)]">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--flux-primary-alpha-20)] bg-gradient-to-br from-[var(--flux-primary-alpha-15)] to-[var(--flux-secondary-alpha-08)] py-1 pl-1 pr-2.5 font-display text-[11px] font-semibold text-[var(--flux-primary-light)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-md" aria-hidden>
                  <FluxyAvatar state="talking" size="fab" />
                </span>
                {t("spotlight.copilot.answerBadge")}
              </div>
              <p className="leading-relaxed text-[var(--flux-text-muted)]">{t("spotlight.copilot.sampleAnswer")}</p>
            </div>
          </div>
        </article>

        <article className={cardBase}>
          <div
            className="pointer-events-none absolute -left-6 -top-6 h-32 w-32 rounded-full bg-[var(--flux-secondary)]/20 blur-3xl transition-transform duration-500 group-hover:scale-110"
            aria-hidden
          />
          <h3 className="relative font-display text-[1.05rem] font-semibold tracking-[-0.01em]">{t("spotlight.okr.title")}</h3>
          <p className="relative mt-2 text-[0.84rem] leading-[1.7] text-[var(--flux-text-muted)]">{t("spotlight.okr.body")}</p>
          <div className="relative mt-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 font-mono text-[11px] text-[var(--flux-text-muted)]/70">{t("spotlight.okr.barObjLabel")}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,white_6%,transparent)]">
                <div className="landing-progress-bar relative h-1.5 w-[72%] rounded-full bg-gradient-to-r from-[var(--flux-primary)] to-[var(--flux-secondary)] transition-[width] duration-1000 ease-out">
                  <span className="landing-progress-sheen absolute inset-0 rounded-full" aria-hidden />
                </div>
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-[11px] font-semibold text-[var(--flux-primary-light)]">72%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 font-mono text-[11px] text-[var(--flux-text-muted)]/70">{t("spotlight.okr.barKrLabel")}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,white_6%,transparent)]">
                <div className="landing-progress-bar relative h-1.5 w-[88%] rounded-full bg-[var(--flux-secondary)] transition-[width] duration-1000 ease-out">
                  <span className="landing-progress-sheen absolute inset-0 rounded-full" aria-hidden />
                </div>
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-[11px] font-semibold text-[var(--flux-secondary)]">88%</span>
            </div>
          </div>
        </article>

        <article className={cardBase}>
          <div
            className="pointer-events-none absolute bottom-0 right-[-20px] h-32 w-32 rounded-full bg-[var(--flux-accent)]/15 blur-3xl transition-transform duration-500 group-hover:scale-110"
            aria-hidden
          />
          <h3 className="relative font-display text-[1.05rem] font-semibold tracking-[-0.01em]">{t("spotlight.anomaly.title")}</h3>
          <p className="relative mt-2 text-[0.84rem] leading-[1.7] text-[var(--flux-text-muted)]">{t("spotlight.anomaly.body")}</p>
          <div className="relative mt-5 flex flex-wrap gap-2">
            <span className="landing-alert-chip inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--flux-accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--flux-accent)_10%,transparent)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--flux-accent)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-[var(--flux-accent)] opacity-70" aria-hidden />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--flux-accent)]" />
              </span>
              {t("spotlight.anomaly.alert1")}
            </span>
            <span className="landing-alert-chip inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--flux-accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--flux-accent)_10%,transparent)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--flux-accent)]">
              <span aria-hidden>⚠</span> {t("spotlight.anomaly.alert2")}
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}
