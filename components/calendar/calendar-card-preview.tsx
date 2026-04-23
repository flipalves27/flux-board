"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { DeliveryCardLike } from "@/lib/delivery-calendar";

type Props = {
  boardId: string;
  card: DeliveryCardLike;
  /** Sprint display names the card is linked to. */
  sprintLabels: string[];
  assigneeLabel: string | null;
  children: ReactNode;
  align?: "start" | "end" | "center";
};

export function CalendarCardPreview({
  boardId,
  card,
  sprintLabels,
  assigneeLabel,
  children,
  align = "start",
}: Props) {
  const locale = useLocale();
  const t = useTranslations("deliveryCalendar.preview");
  const base = `/${locale}/board/${encodeURIComponent(boardId)}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        sideOffset={6}
        align={align}
        className="w-[min(20rem,calc(100vw-1.5rem))] p-0 border-[var(--flux-chrome-alpha-12)]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-3 space-y-2.5 text-left">
          <div>
            <div className="text-sm font-semibold text-[var(--flux-text)] leading-snug line-clamp-3">{card.title}</div>
            {card.dueDate ? (
              <div className="mt-1 text-[10px] tabular-nums text-[var(--flux-text-muted)]">
                {t("due")}: {card.dueDate}
              </div>
            ) : (
              <div className="mt-1 text-[10px] text-[var(--flux-text-muted)]">{t("noDue")}</div>
            )}
            <div className="mt-1 text-[10px] text-[var(--flux-text-muted)]">
              {t("assignee")}: {assigneeLabel ?? "—"}
            </div>
          </div>
          {sprintLabels.length > 0 ? (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {t("sprints")}
              </div>
              <ul className="mt-0.5 text-xs text-[var(--flux-text)] list-disc pl-3 space-y-0.5">
                {sprintLabels.map((n) => (
                  <li key={n} className="line-clamp-2">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link
            href={base}
            className="block text-center rounded-md border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] px-2.5 py-1.5 text-xs font-medium text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-12)]"
          >
            {t("openBoard")}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
