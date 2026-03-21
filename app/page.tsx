"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding, usePlatformDisplayName } from "@/context/org-branding-context";
import { PRICING_BRL, formatBrl } from "@/lib/billing-pricing";

// ─── Icons ────────────────────────────────────────────────────────────────────

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

function CheckIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <circle cx="8" cy="8" r="7" fill="currentColor" fillOpacity="0.12" />
      <path d="M5 8.5l2 2 4-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DashIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Kanban Mock ──────────────────────────────────────────────────────────────

type KanbanMockProps = {
  liveViewLabel: string;
  cols: Array<{ title: string; cards: Array<{ w: string }> }>;
};

function KanbanMock({ liveViewLabel, cols }: KanbanMockProps) {
  return (
    <div className="home-kanban-mock relative overflow-hidden rounded-[var(--flux-rad-xl)] border p-4 md:p-5" aria-hidden>
      <div className="pointer-events-none absolute -right-8 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-[var(--flux-primary)]/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-6 bottom-0 h-32 w-32 rounded-full bg-[var(--flux-secondary)]/12 blur-3xl" />
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--flux-primary-alpha-15)] pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--flux-danger)]/80" />
          <span className="h-2 w-2 rounded-full bg-[var(--flux-warning)]/80" />
          <span className="h-2 w-2 rounded-full bg-[var(--flux-success)]/80" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--flux-text-muted)]">{liveViewLabel}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {cols.map((col) => (
          <div key={col.title} className="home-kanban-col rounded-[var(--flux-rad)] border p-2 md:p-2.5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)] md:text-[11px]">{col.title}</p>
            <div className="flex flex-col gap-2">
              {col.cards.map((c, i) => (
                <div key={i} className="home-kanban-card rounded-md border px-2 py-2.5 md:py-3">
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

// ─── Capability Icon ──────────────────────────────────────────────────────────

const CAP_ICONS: Record<string, React.ReactNode> = {
  dailyInsights: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <circle cx="10" cy="10" r="4" fill="var(--flux-secondary)" fillOpacity="0.2" />
      <circle cx="10" cy="10" r="2" fill="var(--flux-secondary)" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.05 5.05l1.41 1.41M13.54 13.54l1.41 1.41M5.05 14.95l1.41-1.41M13.54 6.46l1.41-1.41" stroke="var(--flux-secondary)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  contextOnCards: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <rect x="3" y="4" width="14" height="12" rx="2" fill="var(--flux-primary)" fillOpacity="0.15" />
      <path d="M6 8h8M6 11h5" stroke="var(--flux-primary-light)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="14" cy="13" r="2.5" fill="var(--flux-accent)" fillOpacity="0.3" />
      <path d="M13.3 13l.7.7 1.2-1.2" stroke="var(--flux-accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  executiveBrief: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <path d="M4 15l3-4 3 2 3-4 3 3" stroke="var(--flux-warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="4" width="14" height="11" rx="1.5" stroke="var(--flux-warning)" strokeOpacity="0.4" strokeWidth="1" />
    </svg>
  ),
  portfolioAndMetrics: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <rect x="3" y="11" width="3" height="5" rx="1" fill="var(--flux-primary)" fillOpacity="0.6" />
      <rect x="8" y="8" width="3" height="8" rx="1" fill="var(--flux-secondary)" fillOpacity="0.6" />
      <rect x="13" y="5" width="3" height="11" rx="1" fill="var(--flux-accent)" fillOpacity="0.6" />
    </svg>
  ),
  discoveryAndDeals: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <circle cx="9" cy="9" r="5" stroke="var(--flux-success)" strokeWidth="1.4" strokeOpacity="0.7" />
      <path d="M13 13l3 3" stroke="var(--flux-success)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 9h4M9 7v4" stroke="var(--flux-success)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  routinesAndAlerts: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <path d="M10 3a7 7 0 110 14A7 7 0 0110 3z" stroke="var(--flux-danger)" strokeWidth="1.2" strokeOpacity="0.5" />
      <path d="M10 6v4l2.5 2.5" stroke="var(--flux-danger)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// ─── Pricing Feature Row ──────────────────────────────────────────────────────

function FeatureRow({ label, included, dim = false }: { label: string; included: boolean; dim?: boolean }) {
  return (
    <li className={`flex items-start gap-2.5 text-sm leading-snug ${dim ? "text-[var(--flux-text-muted)]/55" : "text-[var(--flux-text-muted)]"}`}>
      <span className={`mt-0.5 shrink-0 ${included ? "text-[var(--flux-success)]" : "text-[var(--flux-text-muted)]/30"}`}>
        {included ? <CheckIcon className="w-[15px] h-[15px]" /> : <DashIcon className="w-[15px] h-[15px]" />}
      </span>
      <span>{label}</span>
    </li>
  );
}

// ─── FAQ Accordion Item ────────────────────────────────────────────────────────

function FaqItem({ question, answer, open, onToggle }: { question: string; answer: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-card)] overflow-hidden transition-colors hover:border-[var(--flux-primary-alpha-22)]">
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left font-display text-sm font-semibold md:text-base"
        aria-expanded={open}
      >
        <span>{question}</span>
        <span
          className="mt-0.5 shrink-0 text-[var(--flux-text-muted)] transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <ChevronDownIcon className="w-4 h-4" />
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--flux-primary-alpha-10)] px-5 pb-5 pt-4 text-sm leading-relaxed text-[var(--flux-text-muted)]">
          {answer}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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

  const [billingYearly, setBillingYearly] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ─── Data ────────────────────────────────────────────────────────────────

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

  const capabilityKeys = [
    "dailyInsights",
    "contextOnCards",
    "executiveBrief",
    "portfolioAndMetrics",
    "discoveryAndDeals",
    "routinesAndAlerts",
  ] as const;

  const capabilities = capabilityKeys.map((key) => ({
    key,
    name: t(`capabilities.${key}.name`),
    detail: t(`capabilities.${key}.detail`),
    icon: CAP_ICONS[key],
  }));

  const steps = [
    { step: "01", title: t("steps.step1.title"), text: t("steps.step1.text") },
    { step: "02", title: t("steps.step2.title"), text: t("steps.step2.text") },
    { step: "03", title: t("steps.step3.title"), text: t("steps.step3.text") },
  ];

  const audiences = [
    { title: t("audiences.sales.title"), text: t("audiences.sales.text"), color: "from-[var(--flux-primary)]/15" },
    { title: t("audiences.operations.title"), text: t("audiences.operations.text"), color: "from-[var(--flux-secondary)]/15" },
    { title: t("audiences.leadership.title"), text: t("audiences.leadership.text"), color: "from-[var(--flux-accent)]/12" },
  ];

  const heroStats = [
    { k: t("hero.stats.priority.label"), v: t("hero.stats.priority.value") },
    { k: t("hero.stats.context.label"), v: t("hero.stats.context.value") },
    { k: t("hero.stats.portfolio.label"), v: t("hero.stats.portfolio.value") },
  ];

  const kanbanCols = [
    { title: t("kanbanMock.columns.prospecting"), cards: [{ w: "78%" }, { w: "62%" }] },
    { title: t("kanbanMock.columns.proposal"), cards: [{ w: "88%" }, { w: "55%" }, { w: "70%" }] },
    { title: t("kanbanMock.columns.closing"), cards: [{ w: "92%" }, { w: "68%" }] },
  ];

  const socialStats = [
    { value: t("socialProof.stat1.value"), label: t("socialProof.stat1.label") },
    { value: t("socialProof.stat2.value"), label: t("socialProof.stat2.label") },
    { value: t("socialProof.stat3.value"), label: t("socialProof.stat3.label") },
    { value: t("socialProof.stat4.value"), label: t("socialProof.stat4.label") },
  ];

  const faqItems = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    q: t(`faq.q${n}`),
    a: t(`faq.a${n}`),
  }));

  // Pricing data
  const proPrice = billingYearly ? PRICING_BRL.proSeatYear : PRICING_BRL.proSeatMonth;
  const bizPrice = billingYearly ? PRICING_BRL.businessSeatYear : PRICING_BRL.businessSeatMonth;
  const priceSuffix = billingYearly ? t("pricing.perSeatYearBilled") : t("pricing.perSeatMonth");

  const pricingPlans = [
    {
      id: "free",
      name: t("pricing.plans.free.name"),
      price: t("pricing.plans.free.desc") && "R$ 0",
      priceSub: t("pricing.forever"),
      desc: t("pricing.plans.free.desc"),
      limits: t("pricing.plans.free.limits"),
      cta: t("pricing.plans.free.cta"),
      ctaHref: `${localeRoot}/login`,
      highlighted: false,
      badge: null,
      features: [
        { label: t("pricing.features.kanban"), included: true },
        { label: t("pricing.features.templates"), included: true },
        { label: t("pricing.features.csvExport"), included: true },
        { label: t("pricing.features.activityLog90"), included: true },
        { label: t("pricing.features.commandPalette"), included: true },
        { label: t("pricing.features.forms"), included: true },
        { label: t("pricing.features.executiveBrief"), included: false },
        { label: t("pricing.features.copilot"), included: false },
        { label: t("pricing.features.okrEngine"), included: false },
      ],
      inherit: null,
    },
    {
      id: "pro",
      name: t("pricing.plans.pro.name"),
      price: formatBrl(proPrice),
      priceSub: priceSuffix,
      desc: t("pricing.plans.pro.desc"),
      limits: t("pricing.plans.pro.limits"),
      cta: t("pricing.plans.pro.cta"),
      ctaHref: `${localeRoot}/login`,
      highlighted: false,
      badge: null,
      features: [
        { label: t("pricing.features.executiveBrief"), included: true },
        { label: t("pricing.features.cardContext"), included: true },
        { label: t("pricing.features.dailyInsights"), included: true },
        { label: t("pricing.features.copilot"), included: true },
        { label: t("pricing.features.okrEngine"), included: true },
        { label: t("pricing.features.fluxDocs"), included: true },
        { label: t("pricing.features.portfolioExport"), included: true },
        { label: t("pricing.features.riskScore"), included: true },
        { label: t("pricing.features.logoOnly"), included: true },
      ],
      inherit: t("pricing.allFree"),
    },
    {
      id: "business",
      name: t("pricing.plans.business.name"),
      price: formatBrl(bizPrice),
      priceSub: priceSuffix,
      desc: t("pricing.plans.business.desc"),
      limits: t("pricing.plans.business.limits"),
      cta: t("pricing.plans.business.cta"),
      ctaHref: `${localeRoot}/login`,
      highlighted: true,
      badge: t("pricing.plans.business.badge"),
      features: [
        { label: t("pricing.features.anomalyEmail"), included: true },
        { label: t("pricing.features.whiteLabelFull"), included: true },
        { label: t("pricing.features.workloadBalancer"), included: true },
        { label: t("pricing.features.orgChat"), included: true },
        { label: t("pricing.features.webhooksUnlimited"), included: true },
        { label: t("pricing.features.retroFacilitator"), included: true },
        { label: t("pricing.features.slackTeams"), included: true },
        { label: t("pricing.features.activityLogUnlimited"), included: true },
      ],
      inherit: t("pricing.allPro"),
    },
    {
      id: "enterprise",
      name: t("pricing.plans.enterprise.name"),
      price: t("pricing.customPrice"),
      priceSub: t("pricing.customSub"),
      desc: t("pricing.plans.enterprise.desc"),
      limits: null,
      cta: t("pricing.plans.enterprise.cta"),
      ctaHref: `mailto:${process.env.NEXT_PUBLIC_SALES_EMAIL ?? "sales@fluxboard.app"}`,
      highlighted: false,
      badge: null,
      features: [
        { label: t("pricing.features.sso"), included: true },
        { label: t("pricing.features.customDomain"), included: true },
        { label: t("pricing.features.copilotTools"), included: true },
        { label: t("pricing.features.anomalyWebhook"), included: true },
        { label: t("pricing.features.dedicatedSupport"), included: true },
      ],
      inherit: t("pricing.allBusiness"),
    },
  ];

  return (
    <main
      lang={locale}
      className="home-variant-vibrant home-landing-mesh relative min-h-screen overflow-x-hidden bg-[var(--flux-surface-dark)] text-[var(--flux-text)]"
    >
      {/* Background gradient layer */}
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

        {/* ─── Header ──────────────────────────────────────────────────────── */}
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

          <nav className="order-3 flex w-full items-center justify-center gap-1 text-xs font-semibold text-[var(--flux-text-muted)] md:order-none md:w-auto md:justify-end md:gap-5 md:text-sm">
            <a href="#why" className="rounded-md px-2 py-1 transition-colors hover:text-[var(--flux-text)]">
              {t("nav.why", { appName })}
            </a>
            <a href="#platform" className="rounded-md px-2 py-1 transition-colors hover:text-[var(--flux-text)]">
              {t("nav.platform")}
            </a>
            <a href="#pricing" className="rounded-md px-2 py-1 transition-colors hover:text-[var(--flux-text)]">
              {t("nav.pricing")}
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

        {/* ─── Hero ────────────────────────────────────────────────────────── */}
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

        {/* ─── Social Proof Bar ─────────────────────────────────────────────── */}
        <section className="home-landing-reveal mt-14 md:mt-16" style={{ animationDelay: "120ms" }}>
          <div className="grid grid-cols-2 gap-3 rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-card)]/60 px-5 py-5 backdrop-blur-sm md:grid-cols-4 md:divide-x md:divide-[var(--flux-primary-alpha-12)]">
            {socialStats.map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1 px-2 text-center">
                <span className="font-display text-2xl font-bold text-[var(--flux-primary-light)] md:text-3xl">{s.value}</span>
                <span className="text-[11px] leading-tight text-[var(--flux-text-muted)] md:text-xs">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Why ─────────────────────────────────────────────────────────── */}
        <section id="why" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24">
          <div className="mb-8 max-w-2xl">
            <h2 className="font-display text-2xl font-bold md:text-3xl">{t("why.heading")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("why.description")}</p>
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

        {/* ─── Platform Capabilities ────────────────────────────────────────── */}
        <section id="platform" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold md:text-3xl">{t("platform.heading", { appName })}</h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--flux-text-muted)] md:text-base">{t("platform.description")}</p>
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
                key={cap.key}
                className="tone-card flex flex-col rounded-[var(--flux-rad-lg)] border bg-[var(--flux-surface-card)] p-5 shadow-[var(--shadow-md)] transition-colors hover:border-[var(--flux-secondary-alpha-35)]"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--flux-surface-elevated)]">
                    {cap.icon}
                  </div>
                  <h3 className="font-display text-base font-semibold">{cap.name}</h3>
                </div>
                <p className="flex-1 text-sm leading-relaxed text-[var(--flux-text-muted)]">{cap.detail}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ─── How It Works ─────────────────────────────────────────────────── */}
        <section id="how-it-works" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24">
          <h2 className="font-display text-2xl font-bold md:text-3xl">{t("how.heading")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--flux-text-muted)] md:text-base">{t("how.description")}</p>
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

        {/* ─── Pricing ─────────────────────────────────────────────────────── */}
        <section id="pricing" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24">
          <div className="mb-8 text-center">
            <h2 className="font-display text-2xl font-bold md:text-3xl">{t("pricing.heading")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">
              {t("pricing.description")}
            </p>

            {/* Billing interval toggle */}
            <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-1">
              <button
                onClick={() => setBillingYearly(false)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 ${
                  !billingYearly
                    ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("pricing.monthly")}
              </button>
              <button
                onClick={() => setBillingYearly(true)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 ${
                  billingYearly
                    ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("pricing.yearly")}
                <span className="rounded-full bg-[var(--flux-success)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--flux-success)]">
                  {t("pricing.yearlyTag")}
                </span>
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {pricingPlans.map((plan) => (
              <article
                key={plan.id}
                className={`relative flex flex-col rounded-[var(--flux-rad-xl)] border p-5 transition-transform duration-300 hover:-translate-y-0.5 ${
                  plan.highlighted
                    ? "border-[var(--flux-primary-alpha-45)] bg-gradient-to-b from-[var(--flux-primary-alpha-12)] to-[var(--flux-surface-card)] shadow-[0_0_0_1px_var(--flux-primary-alpha-20),0_20px_40px_-12px_rgba(108,92,231,0.25)]"
                    : "border-[var(--flux-primary-alpha-18)] bg-[var(--flux-surface-card)]"
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-gradient-to-r from-[var(--flux-primary)] to-[var(--flux-secondary-dark)] px-3 py-1 text-[11px] font-bold text-white shadow-lg">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan name */}
                <div className="mb-4">
                  <h3 className={`font-display text-lg font-bold ${plan.highlighted ? "text-[var(--flux-primary-light)]" : "text-[var(--flux-text)]"}`}>
                    {plan.name}
                  </h3>
                  <p className="mt-1 text-xs leading-snug text-[var(--flux-text-muted)]">{plan.desc}</p>
                </div>

                {/* Price */}
                <div className="mb-4 border-b border-[var(--flux-primary-alpha-12)] pb-4">
                  <div className="flex items-end gap-1">
                    <span className="font-display text-3xl font-bold">{plan.price}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--flux-text-muted)]">{plan.priceSub}</p>
                  {plan.limits && (
                    <p className="mt-2 text-[11px] leading-relaxed text-[var(--flux-text-muted)]/70">{plan.limits}</p>
                  )}
                </div>

                {/* Features */}
                <div className="mb-5 flex-1">
                  {plan.inherit && (
                    <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--flux-primary-light)]/70">
                      {plan.inherit}
                    </p>
                  )}
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <FeatureRow key={f.label} label={f.label} included={f.included} />
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                {plan.id === "enterprise" ? (
                  <a
                    href={plan.ctaHref}
                    className="btn-secondary w-full py-2.5 text-center text-sm"
                  >
                    {plan.cta}
                  </a>
                ) : user ? (
                  <Link
                    href={`${localeRoot}/billing`}
                    className={`w-full py-2.5 text-center text-sm ${plan.highlighted ? "btn-primary" : "btn-secondary"}`}
                  >
                    {plan.cta}
                  </Link>
                ) : (
                  <Link
                    href={plan.ctaHref}
                    className={`w-full py-2.5 text-center text-sm ${plan.highlighted ? "btn-primary" : "btn-secondary"}`}
                  >
                    {plan.cta}
                  </Link>
                )}
              </article>
            ))}
          </div>

          {/* Trial note */}
          <p className="mt-5 text-center text-xs text-[var(--flux-text-muted)]">{t("pricing.trialNote")}</p>
        </section>

        {/* ─── Feature Spotlight ────────────────────────────────────────────── */}
        <section className="home-landing-reveal mt-20 md:mt-24">
          <div className="grid gap-5 md:grid-cols-3">
            {/* AI Copilot spotlight */}
            <article className="relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] p-6">
              <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-[var(--flux-primary)]/20 blur-3xl" aria-hidden />
              <div className="relative mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--flux-primary)] to-[var(--flux-primary-dark)]">
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
                  <path d="M4 10h3l2-5 2 9 2-4h3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="relative font-display text-lg font-semibold">Board Copilot</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-[var(--flux-text-muted)]">
                Chat com IA direto no board. Perguntas em linguagem natural, resumos automáticos, identificação de gargalos e execução de ações sem trocar de tela.
              </p>
              <div className="relative mt-4 rounded-lg border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-dark)]/50 px-3 py-2.5 text-xs text-[var(--flux-text-muted)]/80">
                <span className="text-[var(--flux-secondary)]">Copilot › </span>
                Quais cards estão bloqueados há mais de 3 dias?
              </div>
            </article>

            {/* OKR Engine spotlight */}
            <article className="relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-secondary-alpha-20)] bg-[var(--flux-surface-card)] p-6">
              <div className="pointer-events-none absolute -left-6 -top-6 h-32 w-32 rounded-full bg-[var(--flux-secondary)]/15 blur-3xl" aria-hidden />
              <div className="relative mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--flux-secondary-dark)] to-[var(--flux-secondary)]">
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
                  <circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.4" strokeOpacity="0.6" />
                  <circle cx="10" cy="10" r="4" stroke="white" strokeWidth="1.4" />
                  <circle cx="10" cy="10" r="1.5" fill="white" />
                </svg>
              </div>
              <h3 className="relative font-display text-lg font-semibold">OKR Engine</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-[var(--flux-text-muted)]">
                Objetivos e Key Results conectados diretamente aos cards do board. Acompanhe o progresso em tempo real, com projeção de entrega e alertas de desvio.
              </p>
              <div className="relative mt-4 grid grid-cols-2 gap-2">
                {[
                  { label: "Objetivo Q1", pct: 72 },
                  { label: "Key Result 1", pct: 88 },
                ].map((okr) => (
                  <div key={okr.label} className="rounded-md border border-[var(--flux-secondary-alpha-15)] bg-[var(--flux-surface-dark)]/50 px-2.5 py-2">
                    <p className="text-[10px] font-semibold text-[var(--flux-text-muted)]">{okr.label}</p>
                    <div className="mt-1.5 h-1 w-full rounded-full bg-[var(--flux-secondary-alpha-15)]">
                      <div className="h-1 rounded-full bg-[var(--flux-secondary)]" style={{ width: `${okr.pct}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] font-bold text-[var(--flux-secondary)]">{okr.pct}%</p>
                  </div>
                ))}
              </div>
            </article>

            {/* Anomaly Detection spotlight */}
            <article className="relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[rgba(255,107,107,0.2)] bg-[var(--flux-surface-card)] p-6">
              <div className="pointer-events-none absolute -right-6 bottom-0 h-32 w-32 rounded-full bg-[var(--flux-danger)]/10 blur-3xl" aria-hidden />
              <div className="relative mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--flux-danger)] to-[var(--flux-warning)]">
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
                  <path d="M10 3l7 12H3L10 3z" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M10 9v3M10 14v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="relative font-display text-lg font-semibold">Anomaly Detection</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-[var(--flux-text-muted)]">
                Detecção proativa de anomalias com z-scores em throughput, WIP e lead time. Alertas por e-mail e webhooks antes que o problema vire crise.
              </p>
              <div className="relative mt-4 space-y-1.5">
                {[
                  { icon: "⚠", msg: "WIP acima da média (σ 2.4)", color: "text-[var(--flux-warning)]" },
                  { icon: "🔴", msg: "Lead time +38% vs. semana anterior", color: "text-[var(--flux-danger)]" },
                ].map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-[rgba(255,107,107,0.12)] bg-[var(--flux-surface-dark)]/50 px-2.5 py-1.5 text-xs">
                    <span>{a.icon}</span>
                    <span className={`${a.color} font-medium`}>{a.msg}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        {/* ─── Audiences ───────────────────────────────────────────────────── */}
        <section className="home-landing-reveal mt-20 md:mt-24">
          <h2 className="font-display text-2xl font-bold md:text-3xl">{t("audiences.heading")}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {audiences.map((a) => (
              <article key={a.title} className={`relative overflow-hidden rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-18)] bg-[var(--flux-surface-card)] p-6`}>
                <div className={`pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br ${a.color} to-transparent blur-2xl`} aria-hidden />
                <h3 className="relative font-display text-lg font-semibold">{a.title}</h3>
                <p className="relative mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)]">{a.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ─── FAQ ─────────────────────────────────────────────────────────── */}
        <section className="home-landing-reveal mt-20 md:mt-24">
          <h2 className="mb-6 font-display text-2xl font-bold md:text-3xl">{t("faq.heading")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {faqItems.map((item, i) => (
              <FaqItem
                key={i}
                question={item.q}
                answer={item.a}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </div>
        </section>

        {/* ─── CTA ─────────────────────────────────────────────────────────── */}
        <section className="tone-cta home-landing-reveal relative mt-20 overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] px-6 py-12 text-center md:mt-24 md:px-12 md:py-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{ background: "radial-gradient(ellipse 70% 80% at 50% 120%, var(--flux-primary-alpha-35), transparent)" }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-0 top-0 h-64 w-64 rounded-full opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--flux-secondary), transparent)" }}
            aria-hidden
          />
          <div className="relative">
            <p className="hero-chip mx-auto mb-4 inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
              {t("pricing.trialNote")}
            </p>
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
                  <a href="#pricing" className="btn-secondary px-8 py-3 text-[15px]">
                    {t("nav.pricing")}
                  </a>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ─── Footer ──────────────────────────────────────────────────────── */}
        <footer className="mt-14 border-t border-[var(--flux-primary-alpha-15)] pt-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            {/* Brand */}
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))" }}
                >
                  <FluxLogoIcon className="h-4 w-4" />
                </div>
                <span className="font-display text-sm font-bold">{appName}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--flux-text-muted)]">
                {t("footer.copyright", { year: new Date().getFullYear(), appName })}
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-8 text-xs">
              <div className="flex flex-col gap-2">
                <p className="font-semibold text-[var(--flux-text)]">Produto</p>
                <a href="#platform" className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
                  {t("footer.features")}
                </a>
                <a href="#pricing" className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
                  {t("footer.pricing")}
                </a>
                <a href="#how-it-works" className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
                  {t("nav.how")}
                </a>
              </div>
              <div className="flex flex-col gap-2">
                <p className="font-semibold text-[var(--flux-text)]">Plataforma</p>
                <Link href={`${localeRoot}/login`} className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
                  {t("footer.signIn")}
                </Link>
                <a href="#faq" className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
                  FAQ
                </a>
                <Link href={`${localeRoot}/templates`} className="text-[var(--flux-text-muted)] transition-colors hover:text-[var(--flux-primary-light)]">
                  Templates
                </Link>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </main>
  );
}
