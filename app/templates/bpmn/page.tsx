"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { BpmnIconPreview } from "@/components/templates/bpmn-icon-preview";
import { BpmnWorkspace } from "@/components/templates/bpmn-workspace";

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
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={t("bpmnExclusive.title")} backHref={`${localeRoot}/templates`} backLabel={t("bpmnExclusive.back")} />
      <main className="max-w-[1560px] mx-auto px-6 py-10 space-y-6">
        <BpmnIconPreview />
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6">
          <h2 className="font-display font-semibold text-[var(--flux-text)] mb-2">{t("bpmnExclusive.heading")}</h2>
          <p className="text-xs text-[var(--flux-text-muted)] mb-4">{t("bpmnExclusive.hint")}</p>
          <BpmnWorkspace getHeaders={getHeaders} isAdmin={Boolean(user?.isAdmin)} />
        </div>
      </main>
    </div>
  );
}

