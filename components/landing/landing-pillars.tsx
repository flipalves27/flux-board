"use client";

import { useTranslations } from "next-intl";

export function LandingPillars() {
  const t = useTranslations("landing");
  const pillars = [
    {
      title: t("pillars.commercialPace.title"),
      description: t("pillars.commercialPace.description"),
      glow: "bg-[var(--flux-primary-alpha-30)]",
      iconBox: "bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]",
      accentColor: "var(--flux-primary)",
      glyph: "◧",
    },
    {
      title: t("pillars.insights.title"),
      description: t("pillars.insights.description"),
      glow: "bg-[var(--flux-secondary-alpha-32)]",
      iconBox: "bg-[var(--flux-secondary-alpha-10)] text-[var(--flux-secondary)]",
      accentColor: "var(--flux-secondary)",
      glyph: "◉",
    },
    {
      title: t("pillars.executiveView.title"),
      description: t("pillars.executiveView.description"),
      glow: "bg-[var(--flux-accent-alpha-35)]",
      iconBox: "bg-[color-mix(in_srgb,var(--flux-accent)_10%,transparent)] text-[var(--flux-accent)]",
      accentColor: "var(--flux-accent)",
      glyph: "◫",
    },
  ];

  return (
    <section id="why" className="home-landing-reveal scroll-mt-24 py-14 md:scroll-mt-28 md:py-16" aria-labelledby="landing-why-heading">
      <p className="landing-section-badge">{t("why.sectionBadge")}</p>
      <div className="mb-10 max-w-2xl md:mb-12">
        <h2 id="landing-why-heading" className="font-display text-[clamp(1.75rem,3.4vw,2.7rem)] font-bold leading-[1.1] tracking-[-0.025em]">
          {t("why.heading")}
        </h2>
        <p className="mt-3 max-w-[560px] text-[15px] leading-[1.75] text-[var(--flux-text-muted)]">{t("why.description")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3 md:gap-5">
        {pillars.map((p, i) => (
          <article
            key={p.title}
            className="landing-pillar-card group relative cursor-default overflow-hidden rounded-[16px] border border-[var(--flux-primary-alpha-10)] bg-[color-mix(in_srgb,var(--flux-surface-card)_55%,transparent)] px-[22px] py-[28px] backdrop-blur-[14px] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--flux-primary-alpha-30)] hover:bg-[color-mix(in_srgb,var(--flux-surface-elevated)_70%,transparent)] hover:shadow-[0_22px_60px_color-mix(in_srgb,black_28%,transparent)]"
            style={{ ["--pillar-accent" as string]: p.accentColor, animationDelay: `${i * 0.08}s` }}
          >
            <span
              className="landing-pillar-border-glow pointer-events-none absolute inset-0 rounded-[16px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--pillar-accent)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-60"
              aria-hidden
            />
            <div
              className={`pointer-events-none absolute -right-6 -top-6 h-[140px] w-[140px] rounded-full ${p.glow} opacity-40 blur-[44px] transition-all duration-500 group-hover:scale-110 group-hover:opacity-80`}
              aria-hidden
            />

            <div className="relative mb-5 flex items-center gap-3">
              <div
                className={`landing-pillar-icon relative flex h-[44px] w-[44px] items-center justify-center rounded-[12px] text-[1.2rem] leading-none ${p.iconBox} transition-transform duration-300 group-hover:scale-105 group-hover:rotate-[-4deg]`}
                aria-hidden
              >
                {p.glyph}
              </div>
              <span
                className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--flux-text-muted)]/60"
                aria-hidden
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>

            <h3 className="relative font-display text-[1rem] font-semibold leading-snug tracking-[-0.01em] md:text-[1.05rem]">
              {p.title}
            </h3>
            <p className="relative mt-2.5 text-[0.84rem] leading-[1.7] text-[var(--flux-text-muted)]">{p.description}</p>

            <span
              className="landing-pillar-bar pointer-events-none mt-5 block h-[2px] w-10 rounded-full bg-gradient-to-r from-[var(--pillar-accent)] to-transparent opacity-60 transition-all duration-500 group-hover:w-full group-hover:opacity-100"
              aria-hidden
            />
          </article>
        ))}
      </div>
    </section>
  );
}
