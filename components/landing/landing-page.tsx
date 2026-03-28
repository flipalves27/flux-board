"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding, usePlatformDisplayName } from "@/context/org-branding-context";
import { PRICING_BRL, formatBrl } from "@/lib/billing-pricing";
import type { LandingLocale } from "@/lib/landing-models";
import { LandingFaqSection } from "./landing-faq-section";
import { LandingFooter } from "./landing-footer";
import { LandingFooterCta } from "./landing-footer-cta";
import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { LandingHow } from "./landing-how";
import { LandingPillars } from "./landing-pillars";
import { LandingPlatform } from "./landing-platform";
import { LandingPricing } from "./landing-pricing";
import { LandingRoadmap } from "./landing-roadmap";
import { LandingSocialProof } from "./landing-social-proof";
import { LandingSpotlight } from "./landing-spotlight";
import { LandingTrust } from "./landing-trust";
import { LandingUseCases } from "./landing-use-cases";

export default function LandingPage() {
  const { user } = useAuth();
  const pathname = usePathname();
  const localeSegment = pathname.split("/")[1];
  const locale: LandingLocale = localeSegment === "en" ? "en" : "pt-BR";
  const localeRoot = `/${locale}`;
  const t = useTranslations("landing");
  const appName = usePlatformDisplayName();
  const orgBranding = useOrgBranding();
  const logoUrl = orgBranding?.effectiveBranding?.logoUrl?.trim();

  const [billingYearly, setBillingYearly] = useState(false);
  const priceSuffix = billingYearly ? t("pricing.perSeatYearBilled") : t("pricing.perSeatMonth");
  const proPrice = billingYearly ? PRICING_BRL.proSeatYear : PRICING_BRL.proSeatMonth;
  const bizPrice = billingYearly ? PRICING_BRL.businessSeatYear : PRICING_BRL.businessSeatMonth;
  const chargeLabelByTier = {
    pro: `${t("pricing.plans.pro.name")} · ${formatBrl(proPrice)} ${priceSuffix}`,
    business: `${t("pricing.plans.business.name")} · ${formatBrl(bizPrice)} ${priceSuffix}`,
    enterprise: `${t("pricing.plans.enterprise.name")} · ${t("pricing.customPrice")}`,
  };

  return (
    <div className="relative">
      <a
        href="#landing-main"
        className="absolute left-4 top-0 z-[100] -translate-y-[120%] rounded-[var(--flux-rad)] bg-[var(--flux-primary)] px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-4 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--flux-primary-light)]"
      >
        {t("skipToContent")}
      </a>
      <div
        lang={locale}
        className="home-variant-vibrant home-landing-mesh relative min-h-screen overflow-x-hidden bg-[var(--flux-surface-dark)] text-[var(--flux-text)]"
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

        <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 pt-4 sm:px-8 md:pb-20 md:pt-5 lg:px-12 2xl:max-w-[90rem] 2xl:px-16">
          <LandingHeader localeRoot={localeRoot} appName={appName} logoUrl={logoUrl} user={user} />

          <main id="landing-main">
            <LandingHero localeRoot={localeRoot} appName={appName} user={user} />
            <LandingSocialProof />
            <LandingPillars />
            <LandingPlatform localeRoot={localeRoot} appName={appName} user={user} />
            <LandingRoadmap chargeLabelByTier={chargeLabelByTier} />
            <LandingHow />
            <LandingPricing
              localeRoot={localeRoot}
              user={user}
              billingYearly={billingYearly}
              onBillingYearlyChange={setBillingYearly}
            />
            <LandingSpotlight />
            <LandingUseCases />
            <LandingTrust localeRoot={localeRoot} />
            <LandingFaqSection />
            <LandingFooterCta localeRoot={localeRoot} appName={appName} user={user} />
          </main>

          <LandingFooter localeRoot={localeRoot} appName={appName} />
        </div>
      </div>
    </div>
  );
}
