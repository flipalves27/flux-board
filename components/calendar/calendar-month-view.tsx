"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { aggregateDueDatesByDayInMonth, buildSprintCardIndex, classifyCardDelivery } from "@/lib/delivery-calendar";
import type { DeliverySprintLike } from "@/lib/delivery-calendar";
import type { CardData } from "@/app/board/[id]/page";
import { CalendarCardPreview } from "./calendar-card-preview";
import { CalendarDeliveryLegend } from "./calendar-delivery-legend";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function buildMonthCells(year: number, month1to12: number): { inMonth: boolean; day: number; dayKey: string }[] {
  const firstDow = new Date(Date.UTC(year, month1to12 - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  const out: { inMonth: boolean; day: number; dayKey: string }[] = [];
  for (let i = 0; i < firstDow; i++) {
    const d = new Date(Date.UTC(year, month1to12 - 1, 1 - (firstDow - i)));
    out.push({ inMonth: false, day: d.getUTCDate(), dayKey: d.toISOString().slice(0, 10) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dayKey = `${String(year).padStart(4, "0")}-${String(month1to12).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    out.push({ inMonth: true, day: d, dayKey });
  }
  const rows = Math.ceil(out.length / 7);
  const target = Math.max(35, rows * 7);
  let k = 1;
  while (out.length < target) {
    const d = new Date(Date.UTC(year, month1to12 - 1, daysInMonth + k));
    k += 1;
    out.push({ inMonth: false, day: d.getUTCDate(), dayKey: d.toISOString().slice(0, 10) });
  }
  return out;
}

function chipClass(card: CardData, todayKey: string): string {
  const c = classifyCardDelivery(card, todayKey, 7);
  if (c === "done") return "border-[var(--flux-chrome-alpha-20)] bg-[var(--flux-chrome-alpha-10)]";
  if (c === "ok" || c === "no_due")
    return "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-hover)]";
  if (c === "overdue") return "border-[var(--flux-danger-alpha-50)] bg-[var(--flux-danger)]/10";
  if (c === "due_soon") return "border-[var(--flux-warning-alpha-50)] bg-[var(--flux-warning)]/10";
  return "border-[var(--flux-chrome-alpha-12)]";
}

type Props = {
  boardId: string;
  cards: CardData[];
  sprints: DeliverySprintLike[];
  year: number;
  month1to12: number;
  onMonthChange: (y: number, m: number) => void;
  todayKey: string;
  assigneeNameById: (userId: string | null | undefined) => string;
};

export function CalendarMonthView({
  boardId,
  cards,
  sprints,
  year,
  month1to12,
  onMonthChange,
  todayKey,
  assigneeNameById,
}: Props) {
  const t = useTranslations("deliveryCalendar.calendar");
  const tWeek = useTranslations("deliveryCalendar.weekdays");

  const { cardIdToSprintIds } = useMemo(() => buildSprintCardIndex(sprints), [sprints]);
  const sprintNameById = useMemo(() => new Map(sprints.map((s) => [s.id, s.name] as const)), [sprints]);
  const byDay = useMemo(
    () => aggregateDueDatesByDayInMonth(cards, year, month1to12),
    [cards, year, month1to12]
  );
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c] as const)), [cards]);
  const cells = useMemo(() => buildMonthCells(year, month1to12), [year, month1to12]);

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--flux-text)] font-display">
          {t("title", { m: t(`months.${String(month1to12)}` as "1"), y: year })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-secondary text-xs py-1 px-2"
            onClick={() => {
              if (month1to12 === 1) onMonthChange(year - 1, 12);
              else onMonthChange(year, month1to12 - 1);
            }}
          >
            ←
          </button>
          <button
            type="button"
            className="btn-secondary text-xs py-1 px-2"
            onClick={() => {
              if (month1to12 === 12) onMonthChange(year + 1, 1);
              else onMonthChange(year, month1to12 + 1);
            }}
          >
            →
          </button>
        </div>
      </div>
      <CalendarDeliveryLegend />
      <div
        className="grid grid-cols-7 gap-px rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-10)] overflow-hidden"
        data-flux-delivery-month
      >
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="bg-[var(--flux-surface-elevated)] py-1.5 text-center text-[10px] font-semibold uppercase text-[var(--flux-text-muted)]"
          >
            {tWeek(String(w))}
          </div>
        ))}
        {cells.map((cell, i) => {
          const list = (byDay.get(cell.dayKey) ?? []).map((id) => cardById.get(id)).filter(Boolean) as CardData[];
          const isToday = cell.dayKey === todayKey;
          return (
            <div
              key={`${cell.dayKey}-${i}`}
              className={`min-h-[4.5rem] bg-[var(--flux-surface-card)] p-1 flex flex-col gap-0.5
                ${cell.inMonth ? "" : "opacity-50"}
                ${isToday ? "ring-1 ring-inset ring-[var(--flux-primary)]" : ""}
              `}
            >
              <div className="text-[10px] tabular-nums text-right text-[var(--flux-text-muted)]">{cell.day}</div>
              <div className="space-y-0.5 min-h-0">
                {list.map((c) => {
                  const sids = cardIdToSprintIds.get(c.id) ?? [];
                  const sprintLabels = sids.map((id) => sprintNameById.get(id) ?? id);
                  return (
                    <CalendarCardPreview
                      key={c.id}
                      boardId={boardId}
                      card={c}
                      sprintLabels={sprintLabels}
                      assigneeLabel={assigneeNameById(c.assigneeId) ?? null}
                    >
                      <button
                        type="button"
                        title={c.title}
                        className={`w-full text-left max-w-full truncate text-[9px] leading-tight rounded px-0.5 border ${chipClass(
                          c,
                          todayKey
                        )} text-[var(--flux-text)]`}
                      >
                        {c.title}
                      </button>
                    </CalendarCardPreview>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {cards.length > 0 && byDay.size === 0 && (
        <p className="text-xs text-[var(--flux-text-muted)] text-center py-2">{t("emptyMonth")}</p>
      )}
    </div>
  );
}
