"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function SprintCockpitPage() {
  const router = useRouter();
  const { user, isChecked } = useAuth();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("sprintCockpit");

  useEffect(() => {
    if (!isChecked) return;
    if (!user) router.replace(`${localeRoot}/login`);
  }, [isChecked, user, router, localeRoot]);

  if (!isChecked || !user) {
    return <ReportsRouteLoadingFallback />;
  }

  const steps = ["planning", "daily", "review", "retro"] as const;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header />
      <main className="mx-auto max-w-[720px] px-4 py-8">
        <Link href={`${localeRoot}/sprints`} className="text-xs font-semibold text-[var(--flux-primary-light)] hover:underline">
          ← {t("back")}
        </Link>
        <h1 className="mt-4 font-display text-2xl font-bold text-[var(--flux-text)]">{t("title")}</h1>
        <p className="mt-2 text-sm text-[var(--flux-text-muted)] leading-relaxed">{t("subtitle")}</p>
        <ol className="mt-8 space-y-4">
          {steps.map((k, i) => (
            <li
              key={k}
              className="flex gap-4 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--flux-primary-alpha-18)] text-sm font-bold text-[var(--flux-primary-light)]">
                {i + 1}
              </span>
              <div>
                <h2 className="font-semibold text-[var(--flux-text)]">{t(`steps.${k}.title`)}</h2>
                <p className="mt-1 text-sm text-[var(--flux-text-muted)]">{t(`steps.${k}.desc`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-xs text-[var(--flux-text-muted)]">{t("footer")}</p>
      </main>
    </div>
  );
}
