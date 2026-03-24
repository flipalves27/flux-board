"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
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
    <div className="flex min-h-screen flex-col bg-[#F0F2F5] dark:bg-[#0b1020]">
      <Header title={t("bpmnExclusive.title")} backHref={`${localeRoot}/templates`} backLabel={t("bpmnExclusive.back")} />
      <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-4 py-4">
        <div className="mb-3">
          <h2 className="font-display text-[15px] font-semibold text-[#1A2744] dark:text-slate-100">{t("bpmnExclusive.heading")}</h2>
          <p className="mt-1 text-xs text-[#546E7A] dark:text-slate-400">{t("bpmnExclusive.hint")}</p>
        </div>
        <BpmnWorkspace getHeaders={getHeaders} isAdmin={Boolean(user?.isAdmin)} />
      </main>
    </div>
  );
}

