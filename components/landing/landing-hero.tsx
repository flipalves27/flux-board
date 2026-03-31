"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import { LANDING_OPEN_FLUXY_CHAT_EVENT } from "@/lib/landing-open-fluxy-chat";
import { KanbanMock } from "./landing-kanban-mock";

type LandingHeroProps = {
  localeRoot: string;
  appName: string;
  user: unknown;
};

export function LandingHero({ localeRoot, appName, user }: LandingHeroProps) {
  const t = useTranslations("landing");
  const kanbanCols = [
    { title: t("kanbanMock.columns.prospecting"), cards: [{ w: "78%" }, { w: "62%" }] },
    { title: t("kanbanMock.columns.proposal"), cards: [{ w: "88%" }, { w: "55%" }, { w: "70%" }] },
    { title: t("kanbanMock.columns.closing"), cards: [{ w: "92%" }, { w: "68%" }] },
  ];
  const heroStats = [
    { k: t("hero.stats.priority.label"), v: t("hero.stats.priority.value") },
    { k: t("hero.stats.context.label"), v: t("hero.stats.context.value") },
    { k: t("hero.stats.portfolio.label"), v: t("hero.stats.portfolio.value") },
  ];

  const ctaSubtle =
    "font-semibold text-[var(--flux-primary-light)] underline decoration-transparent underline-offset-4 transition-colors hover:text-[var(--flux-text)] hover:decoration-[var(--flux-primary-light)]";

  const openFluxyChat = () => {
    window.dispatchEvent(new CustomEvent(LANDING_OPEN_FLUXY_CHAT_EVENT));
  };

  return (
    <section className="home-landing-reveal mt-3 md:mt-6" aria-labelledby="landing-hero-heading">
      <div className="grid items-center gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <div className="min-w-0">
          <p className="hero-chip inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">{t("hero.chip")}</p>
          <h1
            id="landing-hero-heading"
            className="mt-3 font-display text-[1.85rem] font-bold leading-[1.1] tracking-[-0.02em] sm:text-3xl md:mt-4 md:text-4xl lg:text-[2.85rem] lg:leading-[1.06]"
          >
            {t("hero.title.before")}{" "}
            <span className="bg-gradient-to-r from-[var(--flux-secondary-light)] via-[var(--flux-primary-light)] to-[var(--flux-accent)] bg-clip-text text-transparent">
              {t("hero.title.highlight")}
            </span>{" "}
            {t("hero.title.after")}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("hero.description", { appName })}</p>
          <div className="mt-5 flex flex-col gap-3 rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-18)] bg-[var(--flux-surface-card)]/55 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="shrink-0 rounded-full border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-void-nested-36)] p-0.5 shadow-[var(--flux-shadow-primary-dot-sm)]" aria-hidden>
                <FluxyAvatar state="waving" size="compact" className="scale-90" />
              </div>
              <p className="text-sm leading-snug text-[var(--flux-text-muted)]">{t("hero.fluxyTagline")}</p>
            </div>
            <button type="button" className="btn-secondary w-full shrink-0 px-4 py-2 text-sm sm:w-auto" onClick={openFluxyChat}>
              {t("hero.fluxyCta")}
            </button>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
            {user ? (
              <Link
                href={`${localeRoot}/boards`}
                className="btn-primary landing-btn-shimmer relative w-full justify-center px-6 py-3 text-center text-[15px] sm:w-auto sm:justify-start"
              >
                {t("hero.primary.loggedIn")}
              </Link>
            ) : (
              <Link
                href={`${localeRoot}/login`}
                className="btn-primary landing-btn-shimmer relative w-full justify-center px-6 py-3 text-center text-[15px] sm:w-auto sm:justify-start"
              >
                {t("hero.primary.loggedOut")}
              </Link>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm sm:justify-start sm:text-[15px]">
              <a href="#platform" className={ctaSubtle}>
                {t("hero.secondary")}
              </a>
              <span className="text-[var(--flux-text-muted)]" aria-hidden>
                ·
              </span>
              <a href="#pricing" className={ctaSubtle}>
                {t("hero.pricingLink")}
              </a>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--flux-text-muted)] md:text-sm">{t("hero.quickLine")}</p>
        </div>

        <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
          <div
            className="home-hero-aurora pointer-events-none absolute -inset-8 rounded-full opacity-80 blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at 30% 30%, var(--flux-primary-alpha-35), transparent 55%), radial-gradient(ellipse at 70% 60%, var(--flux-secondary-alpha-25), transparent 50%)",
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -inset-1 rounded-[calc(var(--flux-rad-xl)+6px)] opacity-75 blur-2xl"
            style={{ background: "var(--flux-gradient-landing-cta)" }}
            aria-hidden
          />
          <div className="relative">
            <div className="relative max-h-[min(52vh,420px)] min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain lg:max-h-none lg:overflow-visible">
              <div
                className="absolute -right-1 -top-2 z-10 flex items-center rounded-full border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-surface-card)]/92 px-1.5 py-1 shadow-md backdrop-blur-sm sm:-right-2 sm:-top-3 sm:px-2"
                title={t("hero.fluxyPeekLabel")}
              >
                <FluxyAvatar state="idle" size="fab" className="scale-90 sm:scale-110" />
              </div>
              <KanbanMock liveViewLabel={t("kanbanMock.liveView")} cols={kanbanCols} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center sm:gap-2">
              {heroStats.map((row) => (
                <div
                  key={row.k}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)]/85 px-1 py-1.5 backdrop-blur-sm sm:px-1.5 md:px-2 md:py-2"
                >
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--flux-secondary)] md:text-[10px]">{row.k}</p>
                  <p className="mt-0.5 font-display text-[11px] font-bold leading-tight text-[var(--flux-text)] md:text-sm">{row.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
