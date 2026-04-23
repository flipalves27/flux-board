"use client";

import { useTranslations } from "next-intl";

export function CalendarDeliveryLegend() {
  const t = useTranslations("deliveryCalendar.legend");
  const items: { key: "overdue" | "dueSoon" | "ok" | "noDue" | "done"; className: string }[] = [
    { key: "overdue", className: "bg-[var(--flux-danger)]" },
    { key: "dueSoon", className: "bg-[var(--flux-warning)]" },
    { key: "ok", className: "bg-[var(--flux-success)]" },
    { key: "noDue", className: "bg-[var(--flux-text-muted)]" },
    { key: "done", className: "bg-[var(--flux-chrome-alpha-35)]" },
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--flux-text-muted)]"
      data-flux-delivery-legend
    >
      {items.map(({ key, className }) => (
        <div key={key} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-sm shrink-0 ${className}`} />
          <span>{t(key)}</span>
        </div>
      ))}
    </div>
  );
}
