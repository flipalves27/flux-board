"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding, usePlatformDisplayName } from "@/context/org-branding-context";

function FluxLogoIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <path d="M8 32L16 20L24 26L36 10" stroke="var(--flux-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 10H36V16" stroke="var(--flux-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="2.5" fill="var(--flux-accent-alpha-80)" />
      <circle cx="24" cy="26" r="2.5" fill="var(--flux-secondary-alpha-80)" />
      <path d="M8 36H36" stroke="var(--flux-chrome-alpha-30)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

type KanbanMockProps = {
  liveViewLabel: string;
  cols: Array<{ title: string; cards: Array<{ w: string }> }>;
};

function KanbanMock({ liveViewLabel, cols }: KanbanMockProps) {
  return (
    <div
      className="home-kanban-mock relative overflow-hidden rounded-[var(--flux-rad-xl)] border p-4 md:p-5"
      aria-hidden
    >
      <div className="pointer-events-none absolute -right-8 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-[var(--flux-primary)]/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-6 bottom-0 h-32 w-32 rounded-full bg-[var(--flux-secondary)]/12 blur-3xl" />
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--flux-primary-alpha-15)] pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--flux-danger)]/80" />
          <span className="h-2 w-2 rounded-full bg-[var(--flux-warning)]/80" />
          <span className="h-2 w-2 rounded-full bg-[var(--flux-success)]/80" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--flux-text-muted)]">
          {liveViewLabel}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {cols.map((col) => (
          <div key={col.title} className="home-kanban-col rounded-[var(--flux-rad)] border p-2 md:p-2.5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)] md:text-[11px]">
              {col.title}
            </p>
            <div className="flex flex-col gap-2">
              {col.cards.map((c, i) => (
                <div
                  key={i}
                  className="home-kanban-card rounded-md border px-2 py-2.5 md:py-3"
                >
                  <div className="mb-2 h-1.5 rounded-full bg-[var(--flux-primary-alpha-25)]" style={{ width: c.w }} />
                  <div className="home-kanban-line h-1 rounded" />
                  <div className="home-kanban-line-muted mt-1.5 h-1 w-4/5 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const pathname = usePathname();
  const localeSegment = pathname.split("/")[1];
  const locale = localeSegment === "en" ? "en" : "pt-BR";
  const localeRoot = `/${locale}`;
  const t = useTranslations("landing");
  const appName = usePlatformDisplayName();
  const orgBranding = useOrgBranding();
  const logoUrl = orgBranding?.effectiveBranding?.logoUrl?.trim();
  const aestheticVariant: "sober" | "vibrant" = "vibrant";

  const pillars = [
    {
      title: t("pillars.commercialPace.title"),
      description: t("pillars.commercialPace.description"),
      accent: "from-[var(--flux-primary)]/25 to-transparent",
    },
    {
      title: t("pillars.insights.title"),
      description: t("pillars.insights.description"),
      accent: "from-[var(--flux-secondary)]/20 to-transparent",
    },
    {
      title: t("pillars.executiveView.title"),
      description: t("pillars.executiveView.description"),
      accent: "from-[var(--flux-accent)]/18 to-transparent",
    },
  ];

  const capabilities = [
    { name: t("capabilities.dailyInsights.name"), detail: t("capabilities.dailyInsights.detail") },
    { name: t("capabilities.contextOnCards.name"), detail: t("capabilities.contextOnCards.detail") },
    { name: t("capabilities.executiveBrief.name"), detail: t("capabilities.executiveBrief.detail") },
    {
      name: t("capabilities.portfolioAndMetrics.name"),
      detail: t("capabilities.portfolioAndMetrics.detail"),
    },
    { name: t("capabilities.discoveryAndDeals.name"), detail: t("capabilities.discoveryAndDeals.detail") },
    { name: t("capabilities.routinesAndAlerts.name"), detail: t("capabilities.routinesAndAlerts.detail") },
  ];

  const steps = [
    { step: "01", title: t("steps.step1.title"), text: t("steps.step1.text") },
    { step: "02", title: t("steps.step2.title"), text: t("steps.step2.text") },
    { step: "03", title: t("steps.step3.title"), text: t("steps.step3.text") },
  ];

  const audiences = [
    { title: t("audiences.sales.title"), text: t("audiences.sales.text") },
    { title: t("audiences.operations.title"), text: t("audiences.operations.text") },
    { title: t("audiences.leadership.title"), text: t("audiences.leadership.text") },
  ];

  const heroStats = [
    { k: t("hero.stats.priority.label"), v: t("hero.stats.priority.value") },
    { k: t("hero.stats.context.label"), v: t("hero.stats.context.value") },
    { k: t("hero.stats.portfolio.label"), v: t("hero.stats.portfolio.value") },
  ];

  const kanbanCols = [
    { title: t("kanbanMock.columns.prospecting"), cards: [{ w: "78%" }, { w: "62%" }] },
    {
      title: t("kanbanMock.columns.proposal"),
      cards: [{ w: "88%" }, { w: "55%" }, { w: "70%" }],
    },
    { title: t("kanbanMock.columns.closing"), cards: [{ w: "92%" }, { w: "68%" }] },
  ];

  return (
    <main
      lang={locale}
      className={`home-variant-${aestheticVariant} home-landing-mesh relative min-h-screen overflow-x-hidden bg-[var(--flux-surface-dark)] text-[var(--flux-text)]`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "var(--flux-home-hero-bg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        aria-hidden
      />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-20 pt-5 md:px-10 md:pt-6">
        <header className="hero-shell home-landing-reveal sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[var(--flux-rad-xl)] border px-4 py-3 backdrop-blur-md md:px-5 md:py-3.5">
          <Link href={`${localeRoot}/`} className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] overflow-hidden"
              style={{
                background: logoUrl
                  ? "var(--flux-surface-elevated)"
                  : "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
                boxShadow: logoUrl ? "none" : "0 8px 20px var(--flux-primary-alpha-35)",
              }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="max-h-9 max-w-[36px] object-contain" />
              ) : (
                <FluxLogoIcon className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 text-left">
              <p className="font-display text-base font-bold tracking-tight">{appName}</p>
              <p className="truncate text-xs text-[var(--flux-text-muted)]">{t("header.tagline")}</p>
            </div>
          </Link>
          <nav className="order-3 flex w-full items-center justify-center gap-1 text-xs font-semibold text-[var(--flux-text-muted)] md:order-none md:w-auto md:justify-end md:gap-6 md:text-sm">
            <a href="#why" className="rounded-md px-2 py-1 transition-colors hover:text-[var(--flux-text)]">
              {t("nav.why", { appName })}
            </a>
            <a href="#platform" className="rounded-md px-2 py-1 transition-colors hover:text-[var(--flux-text)]">
              {t("nav.platform")}
            </a>
            <a href="#how-it-works" className="hidden rounded-md px-2 py-1 transition-colors hover:text-[var(--flux-text)] sm:inline">
              {t("nav.how")}
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {user ? (
              <Link href={`${localeRoot}/boards`} className="btn-primary whitespace-nowrap">
                {t("actions.openDashboardLoggedIn")}
              </Link>
            ) : (
              <>
                <Link href={`${localeRoot}/login`} className="btn-ghost hidden sm:inline-flex">
                  {t("actions.signIn")}
                </Link>
                <Link href={`${localeRoot}/login`} className="btn-primary whitespace-nowrap">
                  {t("actions.getStarted")}
                </Link>
              </>
            )}
          </div>
        </header>

        <section className="home-landing-reveal mt-10 md:mt-14" style={{ animationDelay: "80ms" }}>
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div>
              <p className="hero-chip inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
                {t("hero.chip")}
              </p>
              <h1 className="mt-5 font-display text-[1.65rem] font-bold leading-[1.12] tracking-tight md:text-4xl lg:text-[2.65rem] lg:leading-[1.08]">
                {t("hero.title.before")}{" "}
                <span className="bg-gradient-to-r from-[var(--flux-secondary-light)] via-[var(--flux-primary-light)] to-[var(--flux-accent)] bg-clip-text text-transparent">
                  {t("hero.title.highlight")}
                </span>{" "}
                {t("hero.title.after")}
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--flux-text-muted)] md:text-base">
                {t("hero.description", { appName })}
              </p>
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
                <a href="#platform" className="btn-secondary px-6 py-3 text-[15px]">
                  {t("hero.secondary")}
                </a>
              </div>
              <p className="mt-6 text-xs leading-relaxed text-[var(--flux-text-muted)] md:text-sm">{t("hero.quickLine")}</p>
            </div>
            <div className="relative">
              <div
                className="absolute -inset-1 rounded-[calc(var(--flux-rad-xl)+4px)] opacity-70 blur-xl"
                style={{
                  background:
                    "var(--flux-gradient-landing-cta)",
                }}
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

        <section id="why" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24">
          <div className="mb-8 max-w-2xl">
            <h2 className="font-display text-2xl font-bold md:text-3xl">{t("why.heading")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">
              {t("why.description")}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {pillars.map((p) => (
              <article
                key={p.title}
                className="group relative overflow-hidden rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--shadow-md)] transition-transform duration-300 hover:-translate-y-0.5"
              >
                <div
                  className={`pointer-events-none absolute -right-4 -top-4 h-28 w-28 rounded-full bg-gradient-to-br ${p.accent} opacity-80 blur-2xl transition-opacity group-hover:opacity-100`}
                  aria-hidden
                />
                <h3 className="relative font-display text-lg font-semibold leading-snug">{p.title}</h3>
                <p className="relative mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)]">{p.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="platform" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold md:text-3xl">{t("platform.heading", { appName })}</h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--flux-text-muted)] md:text-base">
                {t("platform.description")}
              </p>
            </div>
            {!user && (
              <Link href={`${localeRoot}/login`} className="btn-secondary shrink-0 self-start md:self-auto">
                {t("platform.actions.openPlatform")}
              </Link>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((cap) => (
              <article
                key={cap.name}
                className="tone-card flex flex-col rounded-[var(--flux-rad-lg)] border bg-[var(--flux-surface-card)] p-5 shadow-[var(--shadow-md)] transition-colors hover:border-[var(--flux-secondary-alpha-35)]"
              >
                <div className="mb-3 h-px w-10 rounded-full bg-gradient-to-r from-[var(--flux-primary)] to-[var(--flux-secondary)]" />
                <h3 className="font-display text-base font-semibold">{cap.name}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--flux-text-muted)]">{cap.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24">
          <h2 className="font-display text-2xl font-bold md:text-3xl">{t("how.heading")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--flux-text-muted)] md:text-base">
            {t("how.description")}
          </p>
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

        <section className="home-landing-reveal mt-20 md:mt-24">
          <h2 className="font-display text-2xl font-bold md:text-3xl">{t("audiences.heading")}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {audiences.map((a) => (
              <article key={a.title} className="tone-cyan rounded-[var(--flux-rad-lg)] border bg-[var(--flux-surface-card)] p-6">
                <h3 className="font-display text-lg font-semibold">{a.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)]">{a.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="tone-cta home-landing-reveal relative mt-20 overflow-hidden rounded-[var(--flux-rad-xl)] border bg-[var(--flux-surface-card)] px-6 py-12 text-center md:mt-24 md:px-12 md:py-14">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background: "radial-gradient(ellipse 70% 80% at 50% 120%, var(--flux-primary-alpha-35), transparent)",
            }}
            aria-hidden
          />
          <div className="relative">
            <h2 className="font-display text-2xl font-bold md:text-3xl">{t("cta.heading")}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">
              {t("cta.description")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {user ? (
                <Link href={`${localeRoot}/boards`} className="btn-primary px-8 py-3 text-[15px]">
                  {t("cta.actions.loggedIn", { appName })}
                </Link>
              ) : (
                <>
                  <Link href={`${localeRoot}/login`} className="btn-primary px-8 py-3 text-[15px]">
                    {t("cta.actions.loggedOutPrimary")}
                  </Link>
                  <a href="#why" className="btn-secondary px-8 py-3 text-[15px]">
                    {t("cta.actions.loggedOutSecondary")}
                  </a>
                </>
              )}
            </div>
          </div>
        </section>

        <footer className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-[var(--flux-primary-alpha-15)] pt-8 text-center text-xs text-[var(--flux-text-muted)] md:flex-row md:text-left">
          <p>{t("footer.copyright", { year: new Date().getFullYear(), appName })}</p>
          <div className="flex flex-wrap justify-center gap-4 md:justify-end">
            <Link href={`${localeRoot}/login`} className="font-semibold text-[var(--flux-text)] transition-colors hover:text-[var(--flux-primary-light)]">
              {t("footer.signIn")}
            </Link>
            <span className="hidden text-[var(--flux-text-muted)]/50 md:inline">·</span>
            <a href="#platform" className="font-semibold text-[var(--flux-text)] transition-colors hover:text-[var(--flux-primary-light)]">
              {t("footer.features")}
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
