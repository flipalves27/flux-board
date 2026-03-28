"use client";

import { useTranslations } from "next-intl";

export function LandingSocialProof() {
  const t = useTranslations("landing");
  const socialStats = [
    { value: t("socialProof.stat1.value"), label: t("socialProof.stat1.label") },
    { value: t("socialProof.stat2.value"), label: t("socialProof.stat2.label") },
    { value: t("socialProof.stat3.value"), label: t("socialProof.stat3.label") },
    { value: t("socialProof.stat4.value"), label: t("socialProof.stat4.label") },
  ];

  return (
    <section className="home-landing-reveal mt-8 md:mt-10" style={{ animationDelay: "120ms" }} aria-label={t("socialProof.ariaLabel")}>
      <div className="grid grid-cols-2 gap-3 rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-card)]/60 px-5 py-5 backdrop-blur-sm md:grid-cols-4 md:divide-x md:divide-[var(--flux-primary-alpha-12)]">
        {socialStats.map((s, i) => (
          <div key={i} className="flex flex-col items-center gap-1 px-2 text-center">
            <span className="font-display text-2xl font-bold text-[var(--flux-primary-light)] md:text-3xl">{s.value}</span>
            <span className="text-[11px] leading-tight text-[var(--flux-text-muted)] md:text-xs">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
