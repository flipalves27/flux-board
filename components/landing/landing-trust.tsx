"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

type LandingTrustProps = {
  localeRoot: string;
};

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2l5 2v4c0 3-2.2 5.5-5 6.5C5.2 13.5 3 11 3 8V4l5-2z"
        stroke="var(--flux-secondary)"
        strokeWidth="1.3"
        fill="var(--flux-secondary-alpha-10)"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="6" width="12" height="8" rx="2" stroke="var(--flux-secondary)" strokeWidth="1.3" fill="var(--flux-secondary-alpha-10)" />
      <path d="M5 6V4a3 3 0 016 0v2" stroke="var(--flux-secondary)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 4h10M3 8h7M3 12h10" stroke="var(--flux-secondary)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function LandingTrust({ localeRoot }: LandingTrustProps) {
  const t = useTranslations("landing");
  const points = [
    { icon: <ShieldIcon />, text: t("trust.bullet1") },
    { icon: <LockIcon />, text: t("trust.bullet2") },
    { icon: <DocIcon />, text: t("trust.bullet3") },
  ];

  return (
    <section id="trust" className="home-landing-reveal scroll-mt-24 py-12 md:scroll-mt-28 md:py-14" aria-labelledby="landing-trust-heading">
      <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-15)] bg-[color-mix(in_srgb,var(--flux-surface-card)_50%,transparent)] px-6 py-10 backdrop-blur-sm md:px-9 md:py-10">
        <p className="landing-section-badge">{t("trust.sectionBadge")}</p>
        <h2 id="landing-trust-heading" className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.15] tracking-[-0.02em]">
          {t("trust.heading")}
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-[1.7] text-[var(--flux-text-muted)]">{t("trust.intro")}</p>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {points.map((p) => (
            <li key={p.text} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--flux-secondary-alpha-08)]">{p.icon}</span>
              <p className="text-[13px] leading-[1.6] text-[var(--flux-text-muted)]">{p.text}</p>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Link href={`${localeRoot}/docs`} className="btn-secondary inline-flex px-5 py-2.5 text-sm">
            {t("trust.docsCta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
