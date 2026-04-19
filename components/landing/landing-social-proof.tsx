"use client";

import { useTranslations } from "next-intl";

export function LandingSocialProof() {
  const t = useTranslations("landing");
  const socialStats = [
    { value: t("socialProof.stat1.value"), label: t("socialProof.stat1.label"), glyph: "⚡" },
    { value: t("socialProof.stat2.value"), label: t("socialProof.stat2.label"), glyph: "✦" },
    { value: t("socialProof.stat3.value"), label: t("socialProof.stat3.label"), glyph: "◉" },
    { value: t("socialProof.stat4.value"), label: t("socialProof.stat4.label"), glyph: "∞" },
  ];

  return (
    <section className="home-landing-reveal mt-10 pb-6 md:mt-12" aria-label={t("socialProof.ariaLabel")}>
      <div className="landing-stats-grid relative grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-primary-alpha-05)] md:grid-cols-4">
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--flux-primary-alpha-40)] to-transparent"
          aria-hidden
        />
        {socialStats.map((s, i) => (
          <div
            key={i}
            className="landing-stat-cell group relative flex flex-col items-center gap-1 bg-[color-mix(in_srgb,var(--flux-surface-card)_55%,transparent)] px-4 py-7 text-center backdrop-blur-sm transition-all duration-300 hover:bg-[color-mix(in_srgb,var(--flux-surface-elevated)_68%,transparent)] md:px-5"
          >
            <span
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden
              style={{
                background:
                  "radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--flux-primary) 10%, transparent), transparent 60%)",
              }}
            />
            <span
              className="relative mb-1 font-mono text-[14px] text-[var(--flux-secondary)]/80 transition-transform duration-300 group-hover:scale-110"
              aria-hidden
            >
              {s.glyph}
            </span>
            <span className="relative bg-gradient-to-br from-[var(--flux-primary-light)] to-[var(--flux-secondary)] bg-clip-text font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] text-transparent md:text-[32px]">
              {s.value}
            </span>
            <span className="relative mt-1 max-w-[12rem] text-[11.5px] leading-snug text-[var(--flux-text-muted)]">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
