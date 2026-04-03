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
      glyph: "◧",
    },
    {
      title: t("pillars.insights.title"),
      description: t("pillars.insights.description"),
      glow: "bg-[var(--flux-secondary-alpha-32)]",
      iconBox: "bg-[var(--flux-secondary-alpha-10)] text-[var(--flux-secondary)]",
      glyph: "◉",
    },
    {
      title: t("pillars.executiveView.title"),
      description: t("pillars.executiveView.description"),
      glow: "bg-[var(--flux-accent-alpha-35)]",
      iconBox: "bg-[color-mix(in_srgb,var(--flux-accent)_10%,transparent)] text-[var(--flux-accent)]",
      glyph: "◫",
    },
  ];

  return (
    <section id="why" className="home-landing-reveal scroll-mt-24 py-12 md:scroll-mt-28 md:py-14" aria-labelledby="landing-why-heading">
      <p className="landing-section-badge">{t("why.sectionBadge")}</p>
      <div className="mb-8 max-w-2xl md:mb-9">
        <h2 id="landing-why-heading" className="font-display text-[clamp(1.7rem,3.2vw,2.6rem)] font-bold leading-[1.12] tracking-[-0.02em]">
          {t("why.heading")}
        </h2>
        <p className="mt-3 max-w-[560px] text-[15px] leading-[1.75] text-[var(--flux-text-muted)]">{t("why.description")}</p>
      </div>
      <div className="grid gap-3.5 md:grid-cols-3 md:gap-4">
        {pillars.map((p) => (
          <article
            key={p.title}
            className="group relative cursor-default overflow-hidden rounded-[12px] border border-[var(--flux-primary-alpha-10)] bg-[color-mix(in_srgb,var(--flux-surface-card)_55%,transparent)] px-[22px] py-[26px] backdrop-blur-[12px] transition-all duration-300 after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-[var(--flux-primary-alpha-25)] after:to-transparent after:opacity-0 after:transition-opacity after:duration-300 hover:-translate-y-[3px] hover:border-[var(--flux-primary-alpha-25)] hover:bg-[color-mix(in_srgb,var(--flux-surface-elevated)_70%,transparent)] hover:shadow-[0_16px_44px_color-mix(in_srgb,black_25%,transparent)] hover:after:opacity-100"
          >
            <div
              className={`pointer-events-none absolute -right-5 -top-5 h-[120px] w-[120px] rounded-full ${p.glow} opacity-40 blur-[40px] transition-opacity duration-300 group-hover:opacity-70`}
              aria-hidden
            />
            <div
              className={`relative mb-4 flex h-[38px] w-[38px] items-center justify-center rounded-[10px] text-[1.05rem] leading-none ${p.iconBox}`}
              aria-hidden
            >
              {p.glyph}
            </div>
            <h3 className="relative font-display text-[0.95rem] font-semibold leading-snug">{p.title}</h3>
            <p className="relative mt-2 text-[0.82rem] leading-[1.65] text-[var(--flux-text-muted)]">{p.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
