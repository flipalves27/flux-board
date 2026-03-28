"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
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

  return (
    <section className="home-landing-reveal mt-10 md:mt-14" style={{ animationDelay: "80ms" }} aria-labelledby="landing-hero-heading">
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <div>
          <p className="hero-chip inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">{t("hero.chip")}</p>
          <h1
            id="landing-hero-heading"
            className="mt-5 font-display text-[1.65rem] font-bold leading-[1.12] tracking-tight md:text-4xl lg:text-[2.65rem] lg:leading-[1.08]"
          >
            {t("hero.title.before")}{" "}
            <span className="bg-gradient-to-r from-[var(--flux-secondary-light)] via-[var(--flux-primary-light)] to-[var(--flux-accent)] bg-clip-text text-transparent">
              {t("hero.title.highlight")}
            </span>{" "}
            {t("hero.title.after")}
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("hero.description", { appName })}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {user ? (
              <Link href={`${localeRoot}/boards`} className="btn-primary px-6 py-3 text-[15px]">
                {t("hero.primary.loggedIn")}
              </Link>
            ) : (
              <Link href={`${localeRoot}/login`} className="btn-primary px-6 py-3 text-[15px]">
                {t("hero.primary.loggedOut")}
              </Link>
            )}
            <a href="#pricing" className="btn-secondary px-6 py-3 text-[15px]">
              {t("nav.pricing")}
            </a>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-[var(--flux-text-muted)] md:text-sm">{t("hero.quickLine")}</p>
        </div>

        <div className="relative">
          <div
            className="absolute -inset-1 rounded-[calc(var(--flux-rad-xl)+4px)] opacity-70 blur-xl"
            style={{ background: "var(--flux-gradient-landing-cta)" }}
            aria-hidden
          />
          <div className="relative">
            <KanbanMock liveViewLabel={t("kanbanMock.liveView")} cols={kanbanCols} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {heroStats.map((row) => (
                <div
                  key={row.k}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)]/80 px-2 py-2 backdrop-blur-sm"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-secondary)]">{row.k}</p>
                  <p className="mt-0.5 font-display text-sm font-bold text-[var(--flux-text)]">{row.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
