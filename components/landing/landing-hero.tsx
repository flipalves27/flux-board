"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import { KanbanMock } from "./landing-kanban-mock";

type LandingHeroProps = {
  localeRoot: string;
  user: unknown;
};

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LandingHero({ localeRoot, user }: LandingHeroProps) {
  const t = useTranslations("landing");
  const kanbanCols = [
    {
      title: t("kanbanMock.columns.prospecting"),
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
      title: t("kanbanMock.columns.proposal"),
      cards: [
        {
          w: "88%",
          barClassName: "bg-[var(--flux-accent-alpha-35)]",
          tag: { label: t("kanbanMock.tags.review"), className: "bg-[var(--flux-warning-alpha-12)] text-[var(--flux-warning)]" },
        },
        { w: "55%", barClassName: "bg-[var(--flux-primary-alpha-30)]" },
        { w: "70%", barClassName: "bg-[var(--flux-secondary-alpha-32)]" },
      ],
    },
    {
      title: t("kanbanMock.columns.closing"),
      cards: [
        {
          w: "92%",
          barClassName: "bg-[var(--flux-success-alpha-30)]",
          tag: { label: t("kanbanMock.tags.won"), className: "bg-[var(--flux-success-alpha-12)] text-[var(--flux-success)]" },
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

  const primaryClass =
    "btn-primary landing-btn-shimmer relative inline-flex w-full items-center justify-center gap-2 px-8 py-3.5 text-center text-[15px] sm:w-auto";

  return (
    <section className="home-landing-reveal pt-8 md:pt-12 lg:pt-14" aria-labelledby="landing-hero-heading">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="min-w-0">
          <div className="hero-chip mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--flux-secondary-alpha-25)] bg-[var(--flux-secondary-alpha-06)] px-2 py-1.5 pl-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--flux-secondary)] sm:text-xs">
            <span className="home-landing-chip-dot h-2 w-2 shrink-0 rounded-full bg-[var(--flux-secondary)]" aria-hidden />
            {t("hero.chip")}
          </div>
          <h1
            id="landing-hero-heading"
            className="font-display text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-0.03em]"
          >
            {t("hero.title.line1")}
            <br />
            <span className="bg-gradient-to-br from-[var(--flux-secondary-light)] via-[var(--flux-primary-light)] to-[var(--flux-accent)] bg-clip-text text-transparent">
              {t("hero.title.highlight")}
            </span>
          </h1>
          <p className="mt-5 max-w-[520px] text-base leading-[1.7] text-[var(--flux-text-muted)]">{t("hero.description")}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {user ? (
              <Link href={`${localeRoot}/boards`} className={primaryClass}>
                {t("hero.primary.loggedIn")}
                <ArrowRightIcon className="shrink-0" />
              </Link>
            ) : (
              <Link href={`${localeRoot}/login`} className={primaryClass}>
                {t("hero.primary.loggedOut")}
                <ArrowRightIcon className="shrink-0" />
              </Link>
            )}
            <a href="#platform" className="btn-ghost inline-flex w-full justify-center px-6 py-3 text-[15px] sm:w-auto">
              {t("hero.secondaryPlatform")}
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-6 md:gap-8">
            {heroMetrics.map((m) => (
              <div key={m.label} className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-xl font-bold text-[var(--flux-primary-on-surface)]">{m.val}</span>
                <span className="text-[11px] tracking-[0.03em] text-[var(--flux-text-muted)]">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
          <div
            className="pointer-events-none absolute inset-[-40px] rounded-full opacity-90 blur-[40px]"
            style={{
              background: [
                "radial-gradient(ellipse at 40% 40%, color-mix(in srgb, var(--flux-primary) 20%, transparent), transparent 60%)",
                "radial-gradient(ellipse at 70% 60%, color-mix(in srgb, var(--flux-secondary) 12%, transparent), transparent 55%)",
              ].join(", "),
            }}
            aria-hidden
          />
          <div className="home-hero-aurora pointer-events-none absolute -inset-8 rounded-full opacity-80 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="home-fluxy-peek-float absolute -right-2.5 -top-3.5 z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--flux-secondary-alpha-32)] bg-[var(--flux-surface-card)] shadow-[0_4px_20px_var(--flux-secondary-alpha-22)] sm:h-12 sm:w-12">
              <FluxyAvatar state="idle" size="fab" className="scale-90" title={t("hero.fluxyPeekLabel")} interactive />
            </div>
            <div className="relative max-h-[min(52vh,420px)] min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain lg:max-h-none lg:overflow-visible">
              <KanbanMock liveViewLabel={t("kanbanMock.liveView")} cols={kanbanCols} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
