"use client";

import { useTranslations } from "next-intl";

function PillarIconKanban() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M3 19L8 12L13 15L19 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PillarIconSignal() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="4" fill="rgba(255,255,255,0.2)" />
      <circle cx="11" cy="11" r="2" fill="white" />
      <path d="M11 4v2M11 16v2M4 11h2M16 11h2" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PillarIconPortfolio() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="3" y="4" width="16" height="14" rx="2" stroke="white" strokeWidth="1.4" />
      <path d="M3 9h16M7 4v14" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function LandingPillars() {
  const t = useTranslations("landing");
  const pillars = [
    {
      title: t("pillars.commercialPace.title"),
      description: t("pillars.commercialPace.description"),
      glow: "bg-[rgba(108,92,231,0.3)]",
      iconBg: "bg-gradient-to-br from-[var(--flux-primary)] to-[var(--flux-primary-dark)]",
      icon: <PillarIconKanban />,
    },
    {
      title: t("pillars.insights.title"),
      description: t("pillars.insights.description"),
      glow: "bg-[rgba(0,210,211,0.25)]",
      iconBg: "bg-gradient-to-br from-[var(--flux-secondary-dark)] to-[var(--flux-secondary)]",
      icon: <PillarIconSignal />,
    },
    {
      title: t("pillars.executiveView.title"),
      description: t("pillars.executiveView.description"),
      glow: "bg-[rgba(253,167,223,0.2)]",
      iconBg: "bg-gradient-to-br from-[var(--flux-accent-dark)] to-[var(--flux-accent)]",
      icon: <PillarIconPortfolio />,
    },
  ];

  return (
    <section id="why" className="home-landing-reveal scroll-mt-24 py-12 md:scroll-mt-28 md:py-14" aria-labelledby="landing-why-heading">
      <p className="landing-section-badge mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--flux-secondary)]">
        <span className="h-px w-5 bg-[var(--flux-secondary)]" aria-hidden />
        {t("why.sectionBadge")}
      </p>
      <div className="mb-8 max-w-2xl md:mb-9">
        <h2 id="landing-why-heading" className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.15] tracking-[-0.02em]">
          {t("why.heading")}
        </h2>
        <p className="mt-3 max-w-[560px] text-[15px] leading-[1.7] text-[var(--flux-text-muted)]">{t("why.description")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3 md:gap-5">
        {pillars.map((p) => (
          <article
            key={p.title}
            className="group relative cursor-default overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-15)] bg-[rgba(34,31,58,0.5)] p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--flux-primary-alpha-30)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
          >
            <div
              className={`pointer-events-none absolute -right-5 -top-5 h-[120px] w-[120px] rounded-full ${p.glow} opacity-40 blur-[40px] transition-opacity duration-300 group-hover:opacity-70`}
              aria-hidden
            />
            <div
              className={`relative mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] ${p.iconBg} shadow-[0_8px_24px_rgba(108,92,231,0.25)]`}
            >
              {p.icon}
            </div>
            <h3 className="relative font-display text-lg font-semibold leading-snug">{p.title}</h3>
            <p className="relative mt-2.5 text-sm leading-[1.7] text-[var(--flux-text-muted)]">{p.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
