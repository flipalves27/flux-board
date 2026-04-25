"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { ExecutiveDashboard } from "@/components/dashboard/executive-dashboard";
import { sessionCanManageOrgBilling } from "@/lib/rbac";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";
import { PremiumPageShell, PremiumSectionHeader } from "@/components/ui/premium-primitives";

export default function ExecutiveDashboardPage() {
  const router = useRouter();
  const { user, isChecked } = useAuth();
  const locale = useLocale();
  const t = useTranslations("executiveDashboard");
  const localeRoot = `/${locale}`;

  const canAccess = user ? sessionCanManageOrgBilling(user) : false;

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    if (!canAccess) {
      router.replace(`${localeRoot}/boards`);
    }
  }, [isChecked, user, router, localeRoot, canAccess]);

  if (!isChecked || !user) {
    return <ReportsRouteLoadingFallback />;
  }

  if (!canAccess) {
    return <ReportsRouteLoadingFallback />;
  }

  return (
    <div className="min-h-screen">
      <Header />
      <PremiumPageShell>
        <PremiumSectionHeader eyebrow={t("badge")} title={t("title")} description={t("subtitle")} />
        <ExecutiveDashboard />
      </PremiumPageShell>
    </div>
  );
}
