"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api-client";
import type { ForgeInsightsSnapshot } from "@/lib/forge-types";

export default function ForgeHomePage() {
  const locale = useLocale();
  const t = useTranslations("forgePage");
  const { getHeaders, isChecked } = useAuth();
  const [insights, setInsights] = useState<ForgeInsightsSnapshot | null>(null);

  useEffect(() => {
    if (!isChecked) return;
    void (async () => {
      try {
        const data = await apiGet<{ insights: ForgeInsightsSnapshot }>("/api/forge/insights", getHeaders());
        setInsights(data.insights);
      } catch (e) {
        if (e instanceof ApiError && e.status === 402) setInsights(null);
      }
    })();
  }, [isChecked, getHeaders]);

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-[var(--flux-primary-alpha-20)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-18),transparent)] p-8">
        <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">{t("homeTitle")}</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--flux-text-muted)]">{t("homeSubtitle")}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["PRs", insights?.totalRuns ?? 0],
            ["Merged", insights?.mergedRuns ?? 0],
            ["Avg s", insights?.avgDurationSec != null ? Math.round(insights.avgDurationSec) : "—"],
            ["USD", insights?.totalUsd != null ? insights.totalUsd.toFixed(2) : "—"],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-mid)]/60 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">{k}</p>
              <p className="mt-1 font-display text-xl font-bold text-[var(--flux-text)]">{v}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/${locale}/forge/onboarding`}
          className="rounded-xl bg-[var(--flux-primary)] px-4 py-3 text-sm font-semibold text-white"
        >
          {t("onboarding")}
        </Link>
        <Link
          href={`/${locale}/forge/repos`}
          className="rounded-xl border border-[var(--flux-chrome-alpha-12)] px-4 py-3 text-sm font-semibold text-[var(--flux-text)]"
        >
          {t("connectRepo")}
        </Link>
      </div>
      <p className="text-xs text-[var(--flux-text-muted)]">{t("emptyQueue")}</p>
    </div>
  );
}
