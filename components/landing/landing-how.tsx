"use client";

import { useTranslations } from "next-intl";

export function LandingHow() {
  const t = useTranslations("landing");
  const steps = [
    { step: "01", title: t("steps.step1.title"), text: t("steps.step1.text"), accent: "var(--flux-primary)" },
    { step: "02", title: t("steps.step2.title"), text: t("steps.step2.text"), accent: "var(--flux-secondary)" },
    { step: "03", title: t("steps.step3.title"), text: t("steps.step3.text"), accent: "var(--flux-accent)" },
  ];

  return (
    <section id="how-it-works" className="home-landing-reveal scroll-mt-24 py-14 md:scroll-mt-28 md:py-16" aria-labelledby="landing-how-heading">
      <p className="landing-section-badge">{t("how.sectionBadge")}</p>
      <h2 id="landing-how-heading" className="font-display text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold leading-[1.12] tracking-[-0.025em]">
        {t("how.heading")}
      </h2>
      <p className="mt-3 max-w-[560px] text-[15px] leading-[1.7] text-[var(--flux-text-muted)]">{t("how.description")}</p>

      <div className="relative mt-12">
        <div
          className="pointer-events-none absolute left-0 right-0 top-[46px] hidden h-px md:block"
          aria-hidden
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--flux-primary-alpha-25), var(--flux-secondary-alpha-25), var(--flux-accent-alpha-25), transparent)",
          }}
        />

        <ol className="relative grid gap-5 md:grid-cols-3 md:gap-6">
          {steps.map((s, i) => (
            <li
              key={s.step}
              className="landing-how-card group relative overflow-hidden rounded-[16px] border border-[var(--flux-primary-alpha-12)] bg-[color-mix(in_srgb,var(--flux-surface-card)_50%,transparent)] px-7 py-8 backdrop-blur-[12px] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--flux-primary-alpha-30)] hover:shadow-[0_22px_60px_color-mix(in_srgb,black_28%,transparent)]"
              style={{ ["--step-accent" as string]: s.accent }}
            >
              <span
                className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-40 transition-opacity duration-300 group-hover:opacity-100"
                aria-hidden
                style={{
                  background:
                    "linear-gradient(90deg, transparent, var(--step-accent), transparent)",
                }}
              />
              <div className="relative flex items-center gap-3">
                <span
                  className="landing-how-chip inline-flex h-11 w-11 items-center justify-center rounded-full border text-[13px] font-bold"
                  aria-hidden
                  style={{
                    borderColor: "color-mix(in srgb, var(--step-accent) 35%, transparent)",
                    background: "color-mix(in srgb, var(--step-accent) 12%, transparent)",
                    color: "var(--step-accent)",
                  }}
                >
                  {s.step}
                </span>
                <span
                  className="font-display text-[2.4rem] font-extrabold leading-none opacity-15"
                  aria-hidden
                  style={{ color: "var(--step-accent)" }}
                >
                  {s.step}
                </span>
              </div>
              <h3 className="mt-5 font-display text-[17px] font-semibold tracking-[-0.01em] md:text-[18px]">{s.title}</h3>
              <p className="mt-2.5 text-[13.5px] leading-[1.7] text-[var(--flux-text-muted)]">{s.text}</p>

              <span
                className="landing-how-underline pointer-events-none mt-6 block h-[2px] w-12 rounded-full transition-all duration-500 group-hover:w-full"
                aria-hidden
                style={{ background: "linear-gradient(90deg, var(--step-accent), transparent)" }}
              />

              {i < steps.length - 1 && (
                <span
                  className="pointer-events-none absolute right-[-14px] top-12 hidden h-5 w-5 items-center justify-center rounded-full border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-dark)] text-[10px] font-bold text-[var(--flux-text-muted)] md:flex"
                  aria-hidden
                >
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
