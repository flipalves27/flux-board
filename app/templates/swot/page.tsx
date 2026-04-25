"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { SwotWorkspace } from "@/components/templates/swot-workspace";

export default function SwotTemplatePage() {
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("templates");
  const { user, getHeaders, isChecked } = useAuth();

  useEffect(() => {
    if (!isChecked) return;
    if (!user) router.replace(`${localeRoot}/login`);
  }, [isChecked, user, router, localeRoot]);

  if (!isChecked || !user) return null;

  return (
    <div className="min-h-screen">
      <Header title={t("swotExclusive.title")} backHref={`${localeRoot}/templates`} backLabel={t("swotExclusive.back")} />
      <main className="max-w-[1240px] mx-auto px-6 py-10 space-y-6">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6">
          <h2 className="font-display font-semibold text-[var(--flux-text)] mb-2">{t("swotExclusive.heading")}</h2>
          <p className="text-xs text-[var(--flux-text-muted)] mb-4">{t("swotExclusive.hint")}</p>
          <SwotWorkspace getHeaders={getHeaders} isAdmin={Boolean(user?.isAdmin)} />
        </div>
      </main>
    </div>
  );
}
