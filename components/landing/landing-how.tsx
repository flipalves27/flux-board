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
    <section id="how-it-works" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24" aria-labelledby="landing-how-heading">
      <h2 id="landing-how-heading" className="font-display text-2xl font-bold md:text-3xl">
        {t("how.heading")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-[var(--flux-text-muted)] md:text-base">{t("how.description")}</p>
      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <li
            key={s.step}
            className="relative rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)]/90 p-6 backdrop-blur-sm"
          >
            <span className="font-display text-3xl font-bold tabular-nums text-[var(--flux-primary)]/40">{s.step}</span>
            <h3 className="mt-2 font-display text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--flux-text-muted)]">{s.text}</p>
            {i < steps.length - 1 && (
              <span
                className="absolute right-0 top-1/2 hidden h-px w-4 -translate-y-1/2 translate-x-full bg-gradient-to-r from-[var(--flux-primary)]/50 to-transparent md:block"
                aria-hidden
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
