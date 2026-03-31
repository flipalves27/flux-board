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
    <section className="home-landing-reveal mt-8 pb-6 md:mt-10" aria-label={t("socialProof.ariaLabel")}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-12)] bg-[rgba(108,92,231,0.04)] md:grid-cols-4">
        {socialStats.map((s, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-1 bg-[rgba(34,31,58,0.5)] px-3 py-5 text-center backdrop-blur-sm md:px-4"
          >
            <span className="bg-gradient-to-br from-[var(--flux-primary-light)] to-[var(--flux-secondary)] bg-clip-text font-display text-[28px] font-bold leading-none text-transparent md:text-[30px]">
              {s.value}
            </span>
            <span className="mt-1 max-w-[11rem] text-[11px] leading-snug text-[var(--flux-text-muted)]">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
