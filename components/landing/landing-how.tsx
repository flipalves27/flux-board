"use client";

import { useTranslations } from "next-intl";

export function LandingHow() {
  const t = useTranslations("landing");
  const steps = [
    { step: "01", title: t("steps.step1.title"), text: t("steps.step1.text") },
    { step: "02", title: t("steps.step2.title"), text: t("steps.step2.text") },
    { step: "03", title: t("steps.step3.title"), text: t("steps.step3.text") },
  ];

  return (
    <section id="how-it-works" className="home-landing-reveal scroll-mt-24 py-12 md:scroll-mt-28 md:py-14" aria-labelledby="landing-how-heading">
      <p className="landing-section-badge mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--flux-secondary)]">
        <span className="h-px w-5 bg-[var(--flux-secondary)]" aria-hidden />
        {t("how.sectionBadge")}
      </p>
      <h2 id="landing-how-heading" className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.15] tracking-[-0.02em]">
        {t("how.heading")}
      </h2>
      <p className="mt-3 max-w-[560px] text-[15px] leading-[1.7] text-[var(--flux-text-muted)]">{t("how.description")}</p>
      <ol className="mt-9 grid gap-5 md:grid-cols-3 md:gap-6">
        {steps.map((s, i) => (
          <li
            key={s.step}
            className="relative rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-12)] bg-[color-mix(in_srgb,var(--flux-surface-card)_45%,transparent)] px-7 py-8"
          >
            <span
              className="bg-gradient-to-b from-[var(--flux-primary-alpha-30)] to-[var(--flux-primary-alpha-05)] bg-clip-text font-display text-5xl font-extrabold leading-none text-transparent"
              aria-hidden
            >
              {s.step}
            </span>
            <h3 className="mt-3 font-display text-[17px] font-semibold">{s.title}</h3>
            <p className="mt-2 text-[13px] leading-[1.7] text-[var(--flux-text-muted)]">{s.text}</p>
            {i < steps.length - 1 && (
              <span
                className="absolute right-[-12px] top-1/2 hidden h-0.5 w-6 -translate-y-1/2 bg-gradient-to-r from-[var(--flux-primary-alpha-40)] to-transparent md:block"
                aria-hidden
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
