"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import { KanbanMock } from "./landing-kanban-mock";
import { LandingMagnetCard } from "./landing-magnet-card";
import { LandingCountUp } from "./landing-count-up";
import { PremiumSurface } from "@/components/ui/premium-primitives";

type LandingHeroProps = {
  localeRoot: string;
  user: unknown;
};

export function LandingHero({ localeRoot, user }: LandingHeroProps) {
  const t = useTranslations("landing");
  const kanbanCols = [
    {
      title: t("kanbanMock.columns.backlog"),
      cards: [
        {
          w: "78%",
          barClassName: "bg-[var(--flux-primary-alpha-40)]",
          tag: {
            label: t("kanbanMock.tags.high"),
            className: "bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-on-surface)]",
          },
        },
        { w: "62%", barClassName: "bg-[var(--flux-secondary-alpha-35)]" },
      ],
    },
    {
      title: t("kanbanMock.columns.inProgress"),
      cards: [
        {
          w: "88%",
          barClassName: "bg-[var(--flux-accent-alpha-35)]",
          tag: { label: t("kanbanMock.tags.inReview"), className: "bg-[var(--flux-warning-alpha-12)] text-[var(--flux-warning)]" },
        },
        { w: "55%", barClassName: "bg-[var(--flux-primary-alpha-30)]" },
        { w: "70%", barClassName: "bg-[var(--flux-secondary-alpha-32)]" },
      ],
    },
    {
      title: t("kanbanMock.columns.done"),
      cards: [
        {
          w: "92%",
          barClassName: "bg-[var(--flux-success-alpha-30)]",
          tag: { label: t("kanbanMock.tags.done"), className: "bg-[var(--flux-success-alpha-12)] text-[var(--flux-success)]" },
        },
        { w: "68%", barClassName: "bg-[var(--flux-success-alpha-28)]" },
      ],
    },
  ];
  const heroMetrics = [
    { val: t("hero.metrics.m1.value"), label: t("hero.metrics.m1.label") },
    { val: t("hero.metrics.m2.value"), label: t("hero.metrics.m2.label") },
    { val: t("hero.metrics.m3.value"), label: t("hero.metrics.m3.label") },
  ];

  /** Extrai parte numérica de "3 min" → 3 para animar; retorna null se não houver. */
  const parseMetric = (raw: string): { prefix: string; num: number | null; suffix: string } => {
    const match = raw.match(/^\s*(\D*?)(\d[\d.,]*)(.*)$/);
    if (!match) return { prefix: raw, num: null, suffix: "" };
    const [, prefix, numStr, suffix] = match;
    const num = Number(numStr.replace(/[.,]/g, ""));
    if (!Number.isFinite(num)) return { prefix: raw, num: null, suffix: "" };
    return { prefix, num, suffix };
  };

  const primaryClass =
    "flux-marketing-btn-primary landing-btn-shimmer landing-cta-pulse relative w-full justify-center text-center sm:w-auto";

  return (
    <section
      className="relative pt-10 md:pt-14 lg:pt-16"
      aria-labelledby="landing-hero-heading"
    >
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 z-0 h-[520px] landing-hero-mesh"
        aria-hidden
      />
      <div className="relative grid items-center gap-10 max-[400px]:gap-7 sm:gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="min-w-0">
          <div className="hero-chip landing-hero-chip mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--flux-secondary-alpha-25)] bg-[var(--flux-secondary-alpha-06)] px-2 py-1.5 pl-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--flux-secondary)] shadow-[var(--flux-shadow-secondary-outline)] sm:text-xs">
            <span className="home-landing-chip-dot h-2 w-2 shrink-0 rounded-full bg-[var(--flux-secondary)]" aria-hidden />
            {t("hero.chip")}
          </div>
          <h1
            id="landing-hero-heading"
            className="font-display text-[clamp(2.35rem,6vw,4.65rem)] font-extrabold leading-[0.98] tracking-[-0.055em]"
          >
            {t("hero.title.line1")}
            <br />
            <span className="landing-hero-shimmer bg-gradient-to-r from-[var(--flux-secondary-light)] via-[var(--flux-primary-light)] to-[var(--flux-accent)] bg-clip-text text-transparent">
              {t("hero.title.highlight")}
            </span>
          </h1>
          <p className="mt-6 max-w-[580px] text-[clamp(0.98rem,1.25vw,1.12rem)] leading-[1.75] text-[var(--flux-text-muted)]">
            {t("hero.description")}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {user ? (
              <Link href={`${localeRoot}/boards`} className={primaryClass}>
                {t("hero.primary.loggedIn")}
                <span aria-hidden className="ml-1.5 inline-block transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            ) : (
              <Link href={`${localeRoot}/login`} className={primaryClass}>
                {t("hero.primary.loggedOut")}
                <span aria-hidden className="ml-1.5 inline-block transition-transform">→</span>
              </Link>
            )}
            <a href="#platform" className="flux-marketing-btn-ghost landing-ghost-sheen w-full justify-center sm:w-auto">
              <span className="mr-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-[var(--flux-accent)]" aria-hidden />
              {t("hero.secondaryPlatform")}
            </a>
          </div>

          <ul className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] font-medium text-[var(--flux-text-muted)]">
            <li className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--flux-success-alpha-12)] text-[10px] text-[var(--flux-success)]" aria-hidden>✓</span>
              {t("hero.trustPills.trial")}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--flux-success-alpha-12)] text-[10px] text-[var(--flux-success)]" aria-hidden>✓</span>
              {t("hero.trustPills.noCard")}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--flux-success-alpha-12)] text-[10px] text-[var(--flux-success)]" aria-hidden>✓</span>
              {t("hero.trustPills.ai")}
            </li>
          </ul>

          <div className="mt-9 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3 sm:max-w-xl">
            {heroMetrics.map((m, i) => {
              const parsed = parseMetric(m.val);
              return (
                <LandingMagnetCard key={m.label} intensity={5} glow={0.4}>
                  <PremiumSurface
                    tone={i === 0 ? "accent" : "base"}
                    className="landing-metric-card group min-w-0 px-3 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--flux-primary-alpha-30)]"
                    style={{ animationDelay: `${i * 0.12}s` }}
                  >
                    <span
                      className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-[var(--flux-primary-alpha-40)] to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                      aria-hidden
                    />
                    <span className="block bg-gradient-to-br from-[var(--flux-primary-light)] to-[var(--flux-secondary)] bg-clip-text font-display text-[1.35rem] font-extrabold leading-none text-transparent">
                      {parsed.num !== null ? (
                        <LandingCountUp
                          value={parsed.num}
                          prefix={parsed.prefix}
                          suffix={parsed.suffix}
                        />
                      ) : (
                        m.val
                      )}
                    </span>
                    <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--flux-text-muted)]/85">
                      {m.label}
                    </span>
                  </PremiumSurface>
                </LandingMagnetCard>
              );
            })}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
          <div
            className="pointer-events-none absolute inset-[-40px] rounded-full opacity-90 blur-[40px]"
            style={{
              background: [
                "radial-gradient(ellipse at 40% 40%, color-mix(in srgb, var(--flux-primary) 22%, transparent), transparent 60%)",
                "radial-gradient(ellipse at 70% 60%, color-mix(in srgb, var(--flux-secondary) 14%, transparent), transparent 55%)",
              ].join(", "),
            }}
            aria-hidden
          />
          <div className="home-hero-aurora pointer-events-none absolute -inset-8 rounded-full opacity-80 blur-3xl" aria-hidden />

          <div
            className="landing-hero-live-dot absolute -top-3 left-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-[var(--flux-success-alpha-35)] bg-[color-mix(in_srgb,var(--flux-surface-dark)_82%,transparent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--flux-success)] shadow-[0_6px_20px_color-mix(in_srgb,var(--flux-success)_18%,transparent)] backdrop-blur-md"
            aria-hidden
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--flux-success)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--flux-success)]" />
            </span>
            {t("hero.livePill")}
          </div>

          <div
            className="landing-hero-pill absolute -top-4 right-6 z-20 hidden items-center gap-1.5 rounded-full border border-[var(--flux-primary-alpha-30)] bg-[color-mix(in_srgb,var(--flux-surface-dark)_80%,transparent)] px-2.5 py-1 text-[10px] font-semibold text-[var(--flux-primary-light)] shadow-[0_6px_20px_color-mix(in_srgb,var(--flux-primary)_22%,transparent)] backdrop-blur-md sm:inline-flex"
            aria-hidden
          >
            <span>⚡</span>
            <span className="tracking-wide">{t("hero.aiPill")}</span>
          </div>

          <PremiumSurface tone="elevated" className="relative p-2 sm:p-3">
            <div
              className="landing-fluxy-emoji-float absolute -bottom-5 -right-4 z-10 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[color-mix(in_srgb,white_15%,transparent)] bg-gradient-to-br from-[var(--flux-primary)] to-[var(--flux-secondary)] shadow-[0_10px_32px_var(--flux-primary-alpha-35)] sm:-bottom-4 sm:-right-3.5"
              title={t("hero.fluxyPeekLabel")}
              aria-hidden
            >
              <FluxyAvatar state="waving" size="compact" className="pointer-events-none" />
            </div>
            <div className="relative max-h-[min(52vh,min(420px,100dvh-12rem))] min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain lg:max-h-none lg:overflow-visible">
              <KanbanMock liveViewLabel={t("kanbanMock.liveView")} cols={kanbanCols} />
            </div>
          </PremiumSurface>
        </div>
      </div>
    </section>
  );
}
