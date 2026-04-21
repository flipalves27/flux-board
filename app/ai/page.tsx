"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function FluxAiHubPage() {
  const router = useRouter();
  const { user, isChecked } = useAuth();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("fluxAiHub");

  useEffect(() => {
    if (!isChecked) return;
    if (!user) router.replace(`${localeRoot}/login`);
  }, [isChecked, user, router, localeRoot]);

  if (!isChecked || !user) {
    return <ReportsRouteLoadingFallback />;
  }

  const cards = [
    { href: `${localeRoot}/portfolio`, key: "exec" as const },
    { href: `${localeRoot}/docs`, key: "docs" as const },
    { href: `${localeRoot}/reports`, key: "forecast" as const },
    { href: `${localeRoot}/boards`, key: "copilot" as const },
    { href: `${localeRoot}/sprints/cockpit`, key: "sprintCockpit" as const },
    { href: `${localeRoot}/okrs`, key: "okrs" as const },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">Fluxy</p>
          <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--flux-text-muted)] leading-relaxed">{t("subtitle")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              className="group rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-5 transition-colors hover:border-[var(--flux-primary-alpha-35)]"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--flux-secondary-light)]">
                {t(`cards.${c.key}.badge`)}
              </span>
              <h2 className="mt-2 font-display text-lg font-semibold text-[var(--flux-text)] group-hover:text-[var(--flux-primary-light)]">
                {t(`cards.${c.key}.title`)}
              </h2>
              <p className="mt-2 text-sm text-[var(--flux-text-muted)] leading-relaxed">{t(`cards.${c.key}.desc`)}</p>
            </Link>
          ))}
        </div>
        <div className="mt-10 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-black-alpha-06)] p-5">
          <h3 className="text-sm font-semibold text-[var(--flux-text)]">{t("governance.title")}</h3>
          <p className="mt-2 text-xs text-[var(--flux-text-muted)] leading-relaxed">{t("governance.body")}</p>
        </div>
      </main>
    </div>
  );
}
