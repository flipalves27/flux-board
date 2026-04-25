"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { FluxReportsDashboard } from "@/components/reports/flux-reports-dashboard";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";
import { PremiumPageShell, PremiumSectionHeader } from "@/components/ui/premium-primitives";

export default function ReportsPage() {
  const router = useRouter();
  const { user, isChecked } = useAuth();
  const locale = useLocale();
  const t = useTranslations("reports");
  const localeRoot = `/${locale}`;

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
    }
  }, [isChecked, user, router, localeRoot]);

  if (!isChecked || !user) {
    return <ReportsRouteLoadingFallback />;
  }

  return (
    <div className="flux-page-contract min-h-screen" data-flux-area="analytics">
      <Header />
      <PremiumPageShell>
        <PremiumSectionHeader
          eyebrow={t("badge")}
          title={t("title")}
          description={t("subtitle")}
          action={
          <Link
            href={`${localeRoot}/reports/lean-six-sigma`}
            className="shrink-0 rounded-[var(--flux-rad-sm)] border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] px-3 py-2 text-center text-xs font-semibold text-[var(--flux-primary-light)] transition-colors hover:border-[var(--flux-primary)]"
          >
            {t("lssExecutiveLink")}
          </Link>
          }
        />
        <FluxReportsDashboard />
      </PremiumPageShell>
    </div>
  );
}
