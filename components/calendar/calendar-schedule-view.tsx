"use client";

import { useMemo, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { SprintData } from "@/lib/schemas";
import type { CardData } from "@/app/board/[id]/page";
import {
  buildDefaultScheduleWindow,
  buildScheduleSprintLanes,
  positionOnWindow,
  type ScheduleDateWindow,
  zoomScheduleWindow,
} from "@/lib/delivery-schedule";
import { CalendarCardPreview } from "./calendar-card-preview";
import { buildSprintCardIndex } from "@/lib/delivery-calendar";

type Props = {
  boardId: string;
  sprints: SprintData[];
  cards: CardData[];
  nowMs: number;
  assigneeNameById: (userId: string | null | undefined) => string;
};

export function CalendarScheduleView({ boardId, sprints, cards, nowMs, assigneeNameById }: Props) {
  const t = useTranslations("deliveryCalendar.schedule");
  const [win, setWin] = useState<ScheduleDateWindow>(() => buildDefaultScheduleWindow(nowMs, "month"));
  useEffect(() => {
    setWin(buildDefaultScheduleWindow(Date.now(), "month"));
  }, [boardId]);

  const { lanes, unscheduled } = useMemo(
    () =>
      buildScheduleSprintLanes({
        sprints,
        fullSprints: sprints,
        cards,
        window: win,
      }),
    [sprints, cards, win]
  );
  const { cardIdToSprintIds } = useMemo(() => buildSprintCardIndex(sprints), [sprints]);
  const sprintNameById = useMemo(() => new Map(sprints.map((s) => [s.id, s.name] as const)), [sprints]);

  return (
    <div className="space-y-4 min-w-0" data-flux-delivery-schedule>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--flux-text)] font-display">{t("title")}</h2>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            className="btn-secondary py-1 px-2"
            onClick={() => {
              setWin(buildDefaultScheduleWindow(nowMs, "week"));
            }}
          >
            {t("zoomWeek")}
          </button>
          <button
            type="button"
            className="btn-secondary py-1 px-2"
            onClick={() => {
              setWin(buildDefaultScheduleWindow(nowMs, "month"));
            }}
          >
            {t("zoomMonth")}
          </button>
          <button
            type="button"
            className="btn-secondary py-1 px-2"
            onClick={() => setWin((w) => zoomScheduleWindow(w, 0.65))}
          >
            {t("zoomIn")}
          </button>
          <button
            type="button"
            className="btn-secondary py-1 px-2"
            onClick={() => setWin((w) => zoomScheduleWindow(w, 1.35))}
          >
            {t("zoomOut")}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-[var(--flux-text-muted)]">
        {t("axisHint", {
          a: new Date(win.startMs).toISOString().slice(0, 10),
          b: new Date(win.endMs).toISOString().slice(0, 10),
        })}
      </p>
      <div className="space-y-3">
        {lanes.length === 0 && unscheduled.length === 0 ? (
          <p className="text-xs text-[var(--flux-text-muted)] text-center py-4">{t("noSprints")}</p>
        ) : null}
        {lanes.map((lane) => {
          const sp = lane.sprint;
          return (
            <div
              key={sp.id}
              className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-3 space-y-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 min-w-0">
                <div>
                  <div className="text-sm font-semibold text-[var(--flux-text)]">{sp.name}</div>
                  <div className="text-[10px] text-[var(--flux-text-muted)]">
                    {lane.hasTimeline
                      ? t("sprintWindow", { a: sp.startDate ?? "—", b: sp.endDate ?? "—" })
                      : t("noSprintRange")}
                    {" · "}
                    {t("scope", { p: String(lane.scopePct), a: String(lane.scopeDoneCount), b: String(lane.scopeTotal) })}
                  </div>
                </div>
                {lane.latestBurndown ? (
                  <div className="text-[10px] text-[var(--flux-text-muted)] text-right max-w-[14rem]">
                    {t("burndown", { d: lane.latestBurndown.at, n: String(lane.latestBurndown.remaining) })}
                  </div>
                ) : null}
              </div>
              {lane.completionsInWindow.length > 0 ? (
                <p className="text-[10px] text-[var(--flux-text-muted)]">
                  {t("completions", { n: String(lane.completionsInWindow.length) })}
                </p>
              ) : null}
              {lane.hasTimeline && lane.startMs != null && lane.endMs != null ? (
                <div className="relative h-14 w-full min-w-0 border border-[var(--flux-chrome-alpha-12)] rounded-md bg-[var(--flux-surface-elevated)]/80 overflow-x-auto">
                  <div className="min-w-[720px] h-full relative">
                    {(() => {
                      const a = positionOnWindow(lane.startMs, win);
                      const b = positionOnWindow(lane.endMs, win);
                      if (a == null || b == null) return null;
                      const left = Math.min(a, b) * 100;
                      const wPct = Math.abs(b - a) * 100;
                      return (
                        <div
                          className="absolute top-1 bottom-1 rounded-sm bg-[var(--flux-primary)]/10 border border-[var(--flux-primary-alpha-30)]"
                          style={{ left: `${left}%`, width: `${wPct}%` }}
                        />
                      );
                    })()}
                    {lane.milestones.map((m) => {
                      const p = positionOnWindow(m.dueMs, win);
                      if (p == null) return null;
                      const card = cards.find((c) => c.id === m.cardId);
                      if (!card) return null;
                      const sids = cardIdToSprintIds.get(m.cardId) ?? [];
                      const extra = sids.filter((id) => id !== sp.id);
                      const sprintLabels = [sp.name, ...extra.map((id) => sprintNameById.get(id) ?? id)];
                      return (
                        <span
                          key={m.cardId + m.dueKey}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                          style={{ left: `${p * 100}%` }}
                        >
                          <CalendarCardPreview
                            boardId={boardId}
                            card={card}
                            sprintLabels={sprintLabels}
                            align="center"
                            assigneeLabel={assigneeNameById(card.assigneeId) ?? null}
                          >
                            <button
                              type="button"
                              title={`${m.title} — ${m.dueKey}`}
                              className={`h-2.5 w-2.5 rounded-full border shadow-sm ${
                                m.outOfSprintWindow
                                  ? "border-dashed border-[var(--flux-warning)] bg-[var(--flux-warning)]/40"
                                  : "border-[var(--flux-primary)] bg-[var(--flux-primary-light)]"
                              }`}
                              aria-label={m.title}
                            />
                          </CalendarCardPreview>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-[var(--flux-text-muted)]">{t("placeholdersLane")}</p>
              )}
            </div>
          );
        })}
      </div>
      {unscheduled.length > 0 ? (
        <section
          className="rounded-[var(--flux-rad-lg)] border border-dashed border-[var(--flux-chrome-alpha-20)] bg-[var(--flux-surface-elevated)]/40 p-3"
        >
          <h3 className="text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("unscheduled")}</h3>
          <ul className="text-xs text-[var(--flux-text)] list-disc pl-4 space-y-0.5">
            {unscheduled.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
