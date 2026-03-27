"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { LssExecutiveDashboard } from "@/components/reports/lss-executive-dashboard";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function LssReportsPage() {
  const router = useRouter();
  const { user, isChecked } = useAuth();
  const locale = useLocale();
  const t = useTranslations("reports.lss");
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
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">{t("badge")}</p>
          <h2 className="font-display text-xl font-bold text-[var(--flux-text)]">{t("title")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("subtitle")}</p>
        </div>
        <LssExecutiveDashboard />
      </main>
    </div>
  );
}
