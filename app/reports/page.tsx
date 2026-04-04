"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { FluxReportsDashboard } from "@/components/reports/flux-reports-dashboard";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

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
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">
              {t("badge")}
            </p>
            <h2 className="font-display text-xl font-bold text-[var(--flux-text)]">{t("title")}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("subtitle")}</p>
          </div>
          <Link
            href={`${localeRoot}/reports/lean-six-sigma`}
            className="shrink-0 rounded-[var(--flux-rad-sm)] border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] px-3 py-2 text-center text-xs font-semibold text-[var(--flux-primary-light)] transition-colors hover:border-[var(--flux-primary)]"
          >
            {t("lssExecutiveLink")}
          </Link>
        </div>
        <FluxReportsDashboard />
      </main>
    </div>
  );
}
