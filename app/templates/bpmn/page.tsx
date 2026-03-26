"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { BpmnWorkspace } from "@/components/bpmn/BpmnWorkspace";

export default function BpmnTemplatePage() {
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
    <div className="flex min-h-screen flex-col bg-[var(--flux-surface-mid)]">
      <Header title={t("bpmnExclusive.title")} backHref={`${localeRoot}/templates`} backLabel={t("bpmnExclusive.back")} />
      <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-4 py-4">
        <div className="mb-3">
          <h2 className="font-display text-[15px] font-semibold text-[var(--flux-text)]">{t("bpmnExclusive.heading")}</h2>
          <p className="mt-1 text-xs text-[var(--flux-text-muted)]">{t("bpmnExclusive.hint")}</p>
        </div>
        <BpmnWorkspace getHeaders={getHeaders} isAdmin={Boolean(user?.isAdmin)} />
      </main>
    </div>
  );
}

