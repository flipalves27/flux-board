"use client";

import { useTranslations } from "next-intl";

export function LandingPillars() {
  const t = useTranslations("landing");
  const pillars = [
    {
      title: t("pillars.commercialPace.title"),
      description: t("pillars.commercialPace.description"),
      accent: "from-[var(--flux-primary)]/25 to-transparent",
    },
    {
      title: t("pillars.insights.title"),
      description: t("pillars.insights.description"),
      accent: "from-[var(--flux-secondary)]/20 to-transparent",
    },
    {
      title: t("pillars.executiveView.title"),
      description: t("pillars.executiveView.description"),
      accent: "from-[var(--flux-accent)]/18 to-transparent",
    },
  ];

  return (
    <section id="why" className="home-landing-reveal mt-12 scroll-mt-24 md:mt-16" aria-labelledby="landing-why-heading">
      <div className="mb-5 max-w-2xl md:mb-6">
        <h2 id="landing-why-heading" className="font-display text-2xl font-bold md:text-3xl">
          {t("why.heading")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("why.description")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {pillars.map((p) => (
          <article
            key={p.title}
            className="group relative overflow-hidden rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--shadow-md)] transition-transform duration-300 hover:-translate-y-0.5"
          >
            <div
              className={`pointer-events-none absolute -right-4 -top-4 h-28 w-28 rounded-full bg-gradient-to-br ${p.accent} opacity-80 blur-2xl transition-opacity group-hover:opacity-100`}
              aria-hidden
            />
            <h3 className="relative font-display text-lg font-semibold leading-snug">{p.title}</h3>
            <p className="relative mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)]">{p.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
