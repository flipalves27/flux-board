"use client";

import { Activity, LayoutDashboard, PieChart } from "lucide-react";
import { useTranslations } from "next-intl";

export function LandingPillars() {
  const t = useTranslations("landing");
  const pillars = [
    {
      title: t("pillars.commercialPace.title"),
      description: t("pillars.commercialPace.description"),
      glow: "bg-[var(--flux-primary-alpha-30)]",
      iconBg: "bg-gradient-to-br from-[var(--flux-primary)] to-[var(--flux-primary-dark)]",
      icon: <LayoutDashboard className="h-[22px] w-[22px] text-white" strokeWidth={1.75} aria-hidden />,
    },
    {
      title: t("pillars.insights.title"),
      description: t("pillars.insights.description"),
      glow: "bg-[var(--flux-secondary-alpha-32)]",
      iconBg: "bg-gradient-to-br from-[var(--flux-secondary-dark)] to-[var(--flux-secondary)]",
      icon: <Activity className="h-[22px] w-[22px] text-white" strokeWidth={1.75} aria-hidden />,
    },
    {
      title: t("pillars.executiveView.title"),
      description: t("pillars.executiveView.description"),
      glow: "bg-[var(--flux-accent-alpha-35)]",
      iconBg: "bg-gradient-to-br from-[var(--flux-accent-dark)] to-[var(--flux-accent)]",
      icon: <PieChart className="h-[22px] w-[22px] text-white" strokeWidth={1.75} aria-hidden />,
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
            className="group relative cursor-default overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-15)] bg-[color-mix(in_srgb,var(--flux-surface-card)_52%,transparent)] p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--flux-primary-alpha-30)] hover:shadow-[var(--flux-shadow-lg)]"
          >
            <div
              className={`pointer-events-none absolute -right-5 -top-5 h-[120px] w-[120px] rounded-full ${p.glow} opacity-40 blur-[40px] transition-opacity duration-300 group-hover:opacity-70`}
              aria-hidden
            />
            <div
              className={`relative mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] ${p.iconBg} shadow-[var(--flux-shadow-primary-medium)]`}
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
