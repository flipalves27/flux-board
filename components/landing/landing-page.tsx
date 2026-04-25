"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { MotionConfig } from "framer-motion";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding } from "@/context/org-branding-context";
import { PRICING_BRL, formatBrl } from "@/lib/billing-pricing";
import { DEFAULT_PLATFORM_NAME } from "@/lib/org-branding";
import type { PublicCommercialCatalog } from "@/lib/platform-commercial-settings";
import type { LandingLocale } from "@/lib/landing-models";
import { LandingPublicBackdrop } from "./landing-public-backdrop";
import { LandingCursorAurora } from "./landing-cursor-aurora";
import { LandingScrollProgress } from "./landing-scroll-progress";
import { LandingFaqSection } from "./landing-faq-section";
import { LandingFluxyFaqChat } from "./landing-fluxy-faq-chat";
import { LandingFooter } from "./landing-footer";
import { LandingFooterCta } from "./landing-footer-cta";
import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { LandingHow } from "./landing-how";
import { LandingPillars } from "./landing-pillars";
import { LandingPlatform } from "./landing-platform";
import { LandingPricing } from "./landing-pricing";
import { LandingRoadmap } from "./landing-roadmap";
import { LandingSmartShowcase } from "./landing-smart-showcase";
import { LandingSocialProof } from "./landing-social-proof";
import { LandingSpotlight } from "./landing-spotlight";
import { LandingTrust } from "./landing-trust";
import { ScrollReveal } from "./scroll-reveal";

type LandingPageProps = {
  /** Catálogo SSR (revalidado quando o admin da plataforma salva). */
  initialCatalog?: PublicCommercialCatalog | null;
};

export default function LandingPage({ initialCatalog }: LandingPageProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const localeSegment = pathname.split("/")[1];
  const locale: LandingLocale = localeSegment === "en" ? "en" : "pt-BR";
  const localeRoot = `/${locale}`;
  const t = useTranslations("landing");
  /** Nome de produto na landing pública: sempre o identificador da plataforma, não o nome da org (ex.: white-label). */
  const appName = DEFAULT_PLATFORM_NAME;
  const orgBranding = useOrgBranding();
  const logoUrl = orgBranding?.effectiveBranding?.logoUrl?.trim();

  const [billingYearly, setBillingYearly] = useState(false);
  const priceSuffix = billingYearly ? t("pricing.perSeatYearBilled") : t("pricing.perSeatMonth");
  const pricing = initialCatalog?.pricing ?? PRICING_BRL;
  const proEnabled = initialCatalog?.proEnabled !== false;
  const businessEnabled = initialCatalog?.businessEnabled !== false;
  const proPrice = billingYearly ? pricing.proSeatYear : pricing.proSeatMonth;
  const bizPrice = billingYearly ? pricing.businessSeatYear : pricing.businessSeatMonth;
  const chargeLabelByTier = {
    pro: proEnabled
      ? `${t("pricing.plans.pro.name")} · ${formatBrl(proPrice)} ${priceSuffix}`
      : `${t("pricing.plans.pro.name")} · ${t("pricing.tierUnavailable")}`,
    business: businessEnabled
      ? `${t("pricing.plans.business.name")} · ${formatBrl(bizPrice)} ${priceSuffix}`
      : `${t("pricing.plans.business.name")} · ${t("pricing.tierUnavailable")}`,
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative">
        <a
          href="#landing-main"
          className="flux-marketing-btn-primary absolute left-4 top-0 z-[var(--flux-z-tooltip)] -translate-y-[120%] transition-transform focus:translate-y-4"
        >
          {t("skipToContent")}
        </a>
        <div
          lang={locale}
          className="flux-page-contract home-variant-vibrant relative min-h-screen overflow-x-hidden bg-[var(--flux-surface-dark)] text-[var(--flux-text)]"
          data-flux-area="marketing"
        >
          <LandingPublicBackdrop />
          <LandingScrollProgress />
          <LandingCursorAurora />

          <LandingHeader localeRoot={localeRoot} appName={appName} logoUrl={logoUrl} user={user} />

          <div className="relative z-10 mx-auto w-full max-w-[1200px] px-[max(1rem,env(safe-area-inset-left,0px))] pb-12 pt-[calc(3.75rem+env(safe-area-inset-top,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pl-6 sm:pr-6 md:pb-16 md:pt-[calc(4.25rem+env(safe-area-inset-top,0px))] md:pl-8 md:pr-8 lg:pl-12 lg:pr-12 2xl:max-w-[90rem] 2xl:pl-16 2xl:pr-16">
            {/*
             * Doc §1.2 order: Hero → Why → AI spotlight → Platform → Steps → Pricing → CTA.
             * Extra blocks (social proof, roadmap, trust, FAQ) stay below the core funnel for SEO and product narrative.
             */}
            <main id="landing-main" className="space-y-20 sm:space-y-24 lg:space-y-28">
              <ScrollReveal delay={0}>
                <LandingHero localeRoot={localeRoot} user={user} />
              </ScrollReveal>
              <ScrollReveal delay={0.07}>
                <LandingPillars />
              </ScrollReveal>
              <ScrollReveal delay={0.12}>
                <LandingSmartShowcase />
              </ScrollReveal>
              <ScrollReveal delay={0.18}>
                <LandingSpotlight />
              </ScrollReveal>
              <ScrollReveal delay={0.24}>
                <LandingPlatform localeRoot={localeRoot} appName={appName} user={user} />
              </ScrollReveal>
              <ScrollReveal delay={0.3}>
                <LandingHow />
              </ScrollReveal>
              <ScrollReveal delay={0.36}>
                <LandingPricing
                  localeRoot={localeRoot}
                  user={user}
                  billingYearly={billingYearly}
                  onBillingYearlyChange={setBillingYearly}
                  pricing={pricing}
                  proEnabled={proEnabled}
                  businessEnabled={businessEnabled}
                />
              </ScrollReveal>
              <ScrollReveal delay={0.42}>
                <LandingSocialProof />
              </ScrollReveal>
              <ScrollReveal delay={0.48}>
                <LandingRoadmap chargeLabelByTier={chargeLabelByTier} />
              </ScrollReveal>
              <ScrollReveal delay={0.54}>
                <LandingTrust localeRoot={localeRoot} />
              </ScrollReveal>
              <ScrollReveal delay={0.6}>
                <LandingFaqSection />
              </ScrollReveal>
              <ScrollReveal delay={0.66}>
                <LandingFooterCta localeRoot={localeRoot} appName={appName} user={user} />
              </ScrollReveal>
            </main>

            <LandingFooter localeRoot={localeRoot} appName={appName} logoUrl={logoUrl} />
          </div>

          <LandingFluxyFaqChat />
        </div>
      </div>
    </MotionConfig>
  );
}
