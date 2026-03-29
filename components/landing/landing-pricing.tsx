"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatBrl } from "@/lib/billing-pricing";
import type { CommercialDisplayPricing } from "@/lib/platform-commercial-settings";
import type { PricingPlanViewModel } from "@/lib/landing-models";
import { FeatureRow } from "./landing-primitives";

type LandingPricingProps = {
  localeRoot: string;
  user: unknown;
  billingYearly: boolean;
  onBillingYearlyChange: (yearly: boolean) => void;
  pricing: CommercialDisplayPricing;
  proEnabled: boolean;
  businessEnabled: boolean;
};

function buildPlans(
  t: ReturnType<typeof useTranslations<"landing">>,
  billingYearly: boolean,
  localeRoot: string,
  pricing: CommercialDisplayPricing,
  proEnabled: boolean,
  businessEnabled: boolean
): PricingPlanViewModel[] {
  const proPrice = billingYearly ? pricing.proSeatYear : pricing.proSeatMonth;
  const bizPrice = billingYearly ? pricing.businessSeatYear : pricing.businessSeatMonth;
  const priceSuffix = billingYearly ? t("pricing.perSeatYearBilled") : t("pricing.perSeatMonth");

  const all: PricingPlanViewModel[] = [
    {
      id: "free",
      name: t("pricing.plans.free.name"),
      price: formatBrl(0),
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
  return all.filter((p) => {
    if (p.id === "pro") return proEnabled;
    if (p.id === "business") return businessEnabled;
    return true;
  });
}

export function LandingPricing({
  localeRoot,
  user,
  billingYearly,
  onBillingYearlyChange,
  pricing,
  proEnabled,
  businessEnabled,
}: LandingPricingProps) {
  const t = useTranslations("landing");
  const pricingPlans = buildPlans(t, billingYearly, localeRoot, pricing, proEnabled, businessEnabled);

  return (
    <section id="pricing" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24" aria-labelledby="landing-pricing-heading">
      <div className="mb-8 text-center">
        <h2 id="landing-pricing-heading" className="font-display text-2xl font-bold md:text-3xl">
          {t("pricing.heading")}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("pricing.description")}</p>

        <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-1">
          <button
            type="button"
            onClick={() => onBillingYearlyChange(false)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 ${
              !billingYearly
                ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
          >
            {t("pricing.monthly")}
          </button>
          <button
            type="button"
            onClick={() => onBillingYearlyChange(true)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 ${
              billingYearly
                ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
          >
            {t("pricing.yearly")}
            <span className="rounded-full bg-[var(--flux-success)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--flux-success)]">{t("pricing.yearlyTag")}</span>
          </button>
        </div>
      </div>

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
            {plan.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-gradient-to-r from-[var(--flux-primary)] to-[var(--flux-secondary-dark)] px-3 py-1 text-[11px] font-bold text-white shadow-lg">
                  {plan.badge}
                </span>
              </div>
            )}

            <div className="mb-4">
              <h3 className={`font-display text-lg font-bold ${plan.highlighted ? "text-[var(--flux-primary-light)]" : "text-[var(--flux-text)]"}`}>{plan.name}</h3>
              <p className="mt-1 text-xs leading-snug text-[var(--flux-text-muted)]">{plan.desc}</p>
            </div>

            <div className="mb-4 border-b border-[var(--flux-primary-alpha-12)] pb-4">
              <div className="flex items-end gap-1">
                <span className="font-display text-3xl font-bold">{plan.price}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--flux-text-muted)]">{plan.priceSub}</p>
              {plan.limits && <p className="mt-2 text-[11px] leading-relaxed text-[var(--flux-text-muted)]/70">{plan.limits}</p>}
            </div>

            <div className="mb-5 flex-1">
              {plan.inherit && (
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--flux-primary-light)]/70">{plan.inherit}</p>
              )}
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <FeatureRow key={f.label} label={f.label} included={f.included} />
                ))}
              </ul>
            </div>

            {plan.id === "enterprise" ? (
              <a href={plan.ctaHref} className="btn-secondary w-full py-2.5 text-center text-sm">
                {plan.cta}
              </a>
            ) : user ? (
              <Link href={`${localeRoot}/billing`} className={`w-full py-2.5 text-center text-sm ${plan.highlighted ? "btn-primary" : "btn-secondary"}`}>
                {plan.cta}
              </Link>
            ) : (
              <Link href={plan.ctaHref} className={`w-full py-2.5 text-center text-sm ${plan.highlighted ? "btn-primary" : "btn-secondary"}`}>
                {plan.cta}
              </Link>
            )}
          </article>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-[var(--flux-text-muted)]">{t("pricing.trialNote")}</p>
    </section>
  );
}
