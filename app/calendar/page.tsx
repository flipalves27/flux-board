"use client";

import { useLocale, useTranslations } from "next-intl";
import { Header } from "@/components/header";
import { CalendarHubPage } from "@/components/calendar/calendar-hub-page";

export default function CalendarPage() {
  const t = useTranslations("deliveryCalendar");
  const locale = useLocale();
  return (
    <div className="min-h-screen flex flex-col bg-[var(--flux-surface-canvas)]">
      <Header
        title={t("title")}
        backHref={`/${locale}/boards`}
        backLabel={t("backBoards")}
      />
      <main className="flex-1 min-w-0 min-h-0">
        <CalendarHubPage />
      </main>
    </div>
  );
}
