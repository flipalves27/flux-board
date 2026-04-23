"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { DeliverySprintLike } from "@/lib/delivery-calendar";
import type { HubMode } from "./calendar-types";

type BoardItem = { id: string; name: string };

type Props = {
  mode: HubMode;
  onMode: (m: HubMode) => void;
  boards: BoardItem[];
  boardId: string;
  onBoardId: (id: string) => void;
  sprints: DeliverySprintLike[];
  sprintId: string;
  onSprintId: (id: string) => void;
  children: ReactNode;
};

export function CalendarHubLayout({
  mode,
  onMode,
  boards,
  boardId,
  onBoardId,
  sprints,
  sprintId,
  onSprintId,
  children,
}: Props) {
  const t = useTranslations("deliveryCalendar");

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4 min-w-0" data-flux-delivery-hub>
      <p className="text-sm text-[var(--flux-text-muted)] max-w-3xl leading-relaxed">{t("subtitle")}</p>
      <div
        className="board-segment flex flex-wrap items-center gap-1 p-1 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-08)] w-fit"
        role="group"
        aria-label={t("modeGroupLabel")}
      >
        {(
          [
            { id: "calendar" as const, label: t("modes.calendar") },
            { id: "manager" as const, label: t("modes.manager") },
            { id: "schedule" as const, label: t("modes.schedule") },
          ] as const
        ).map((m) => {
          const isOn = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onMode(m.id)}
              className={
                isOn
                  ? "px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                  : "px-3 py-1.5 rounded-md text-xs font-medium text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }
              aria-pressed={isOn}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--flux-text-muted)]">
          {t("selectBoard")}
          <select
            className="min-w-[12rem] rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] px-2.5 py-1.5 text-sm text-[var(--flux-text)]"
            value={boardId}
            onChange={(e) => onBoardId(e.target.value)}
          >
            {boards.length === 0 ? (
              <option value="">{t("emptyNoBoards")}</option>
            ) : null}
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--flux-text-muted)]">
          {t("selectSprint")}
          <select
            className="min-w-[12rem] rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] px-2.5 py-1.5 text-sm text-[var(--flux-text)]"
            value={sprintId}
            onChange={(e) => onSprintId(e.target.value)}
            disabled={sprints.length === 0}
          >
            <option value="">{t("allSprints")}</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {children}
    </div>
  );
}
