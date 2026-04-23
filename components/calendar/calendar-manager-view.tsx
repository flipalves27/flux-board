"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataFadeIn } from "@/components/ui/data-fade-in";
import {
  buildImmediateRiskList,
  buildManagerByAssignee,
  buildManagerSprintTable,
  buildSprintCardIndex,
  computeManagerKpis,
  makeCardLookup,
} from "@/lib/delivery-calendar";
import type { DeliverySprintLike } from "@/lib/delivery-calendar";
import type { CardData } from "@/app/board/[id]/page";
import { CalendarDeliveryLegend } from "./calendar-delivery-legend";
import { CalendarCardPreview } from "./calendar-card-preview";

type Member = { userId: string; username: string; name?: string };

type Props = {
  boardId: string;
  cards: CardData[];
  sprints: DeliverySprintLike[];
  sprint: DeliverySprintLike | null;
  members: Member[];
  nowMs: number;
  assigneeNameById: (userId: string | null | undefined) => string;
};

export function CalendarManagerView({ boardId, cards, sprints, sprint, members, nowMs, assigneeNameById }: Props) {
  const t = useTranslations("deliveryCalendar.manager");
  const { cardIdToSprintIds } = useMemo(() => buildSprintCardIndex(sprints), [sprints]);
  const sprintNameById = useMemo(() => new Map(sprints.map((s) => [s.id, s.name] as const)), [sprints]);
  const cardBy = useMemo(() => makeCardLookup(cards), [cards]);
  const kpis = useMemo(
    () => computeManagerKpis(cards, { nowMs, riskDays: 7, sprint: sprint ?? undefined }),
    [cards, nowMs, sprint]
  );
  const byAssignee = useMemo(
    () => buildManagerByAssignee(cards, members, { nowMs, riskDays: 7, sprint: sprint ?? undefined }),
    [cards, members, nowMs, sprint]
  );
  const sprintTable = useMemo(
    () => buildManagerSprintTable(sprints, cards, cardBy, { nowMs, riskDays: 7 }),
    [sprints, cards, cardBy, nowMs]
  );
  const risk = useMemo(
    () => buildImmediateRiskList(cards, { nowMs, riskDays: 7, sprint: sprint ?? undefined, limit: 20 }),
    [cards, nowMs, sprint]
  );

  return (
    <DataFadeIn active className="space-y-6 min-w-0">
      <div className="text-xs text-[var(--flux-text-muted)]">
        {sprint ? t("scopeSprint", { name: sprint.name }) : t("scopeBoard")}
      </div>
      <CalendarDeliveryLegend />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
        <Kpi
          label={t("kpiTotal")}
          value={String(kpis.totalCards)}
        />
        <Kpi label={t("kpiWithDue")} value={String(kpis.withDue)} sub={t("kpiOfActive", { n: kpis.active })} />
        <Kpi
          label={t("kpiOverdue")}
          value={String(kpis.overdue)}
        />
        <Kpi
          label={t("kpiDueSoon")}
          value={String(kpis.dueSoon)}
        />
        <Kpi
          label={t("kpiDone")}
          value={kpis.pctComplete == null ? "—" : `${kpis.pctComplete}%`}
        />
        <Kpi
          label={t("kpiCoverage")}
          value={kpis.forecastCoveragePct == null ? "—" : `${kpis.forecastCoveragePct}%`}
        />
      </div>
      <section
        className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4"
        data-flux-manager-risk
      >
        <h3 className="text-xs font-semibold uppercase text-[var(--flux-text-muted)] mb-2">{t("riskTitle")}</h3>
        {risk.length === 0 ? (
          <p className="text-xs text-[var(--flux-text-muted)]">{t("riskEmpty")}</p>
        ) : (
          <ul className="space-y-1.5 max-h-[16rem] overflow-y-auto pr-1">
            {risk.map((r) => {
              const sids = cardIdToSprintIds.get(r.card.id) ?? [];
              const sprintLabels = sids.map((id) => sprintNameById.get(id) ?? id);
              return (
                <li
                  key={r.card.id}
                  className="flex items-center justify-between gap-2 text-xs text-[var(--flux-text)] border-b border-[var(--flux-chrome-alpha-08)] last:border-0 py-1"
                >
                  <div className="min-w-0">
                    <CalendarCardPreview
                      boardId={boardId}
                      card={r.card}
                      sprintLabels={sprintLabels}
                      assigneeLabel={assigneeNameById(r.card.assigneeId) ?? null}
                    >
                      <button
                        type="button"
                        className="text-left w-full min-w-0 font-medium text-[var(--flux-primary-light)] hover:underline truncate"
                      >
                        {r.card.title}
                      </button>
                    </CalendarCardPreview>
                    {r.dueKey ? <div className="text-[10px] text-[var(--flux-text-muted)] tabular-nums">{r.dueKey}</div> : null}
                  </div>
                  <span
                    className={
                      r.reason === "overdue" ? "text-[var(--flux-danger)]" : "text-[var(--flux-warning)]"
                    }
                  >
                    {r.reason === "overdue" ? t("badgeOverdue") : t("badgeSoon")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
        <section
          className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4"
          data-flux-manager-assignee
        >
          <h3 className="text-xs font-semibold uppercase text-[var(--flux-text-muted)] mb-2">
            {t("byAssigneeTitle")}
          </h3>
          {byAssignee.length === 0 ? (
            <p className="text-xs text-[var(--flux-text-muted)]">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-xs">
                <thead>
                  <tr className="text-[var(--flux-text-muted)] border-b border-[var(--flux-chrome-alpha-10)] text-left">
                    <th className="py-1.5 pr-2">{t("tableAssignee")}</th>
                    <th className="py-1.5 pr-2 text-right tabular-nums">{t("tableTotal")}</th>
                    <th className="py-1.5 pr-2 text-right tabular-nums">{t("tableDone")}</th>
                    <th className="py-1.5 pr-2 text-right text-[var(--flux-danger)] tabular-nums">{t("tableOverdue")}</th>
                    <th className="py-1.5 text-right text-[var(--flux-warning)] tabular-nums">{t("tableSoon")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byAssignee.map((row) => (
                    <tr
                      key={row.assigneeKey}
                      className="border-b border-[var(--flux-chrome-alpha-08)] last:border-0"
                    >
                      <td className="py-1.5 pr-2 font-medium text-[var(--flux-text)] truncate max-w-[12rem]">
                        {row.displayLabel}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{row.total}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{row.done}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{row.overdue}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.dueSoon}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section
          className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4"
          data-flux-manager-sprints
        >
          <h3 className="text-xs font-semibold uppercase text-[var(--flux-text-muted)] mb-2">{t("bySprintTitle")}</h3>
          {sprintTable.length === 0 ? (
            <p className="text-xs text-[var(--flux-text-muted)]">{t("noSprints")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-xs">
                <thead>
                  <tr className="text-[var(--flux-text-muted)] border-b border-[var(--flux-chrome-alpha-10)] text-left">
                    <th className="py-1.5 pr-2">{t("sprintName")}</th>
                    <th className="py-1.5 pr-2">{t("sprintStatus")}</th>
                    <th className="py-1.5 pr-2">{t("sprintWhen")}</th>
                    <th className="py-1.5 pr-2 text-right tabular-nums">{t("sprintScope")}</th>
                    <th className="py-1.5 text-right text-[var(--flux-danger)] tabular-nums">
                      {t("sprintOverdue")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sprintTable.map((row) => (
                    <tr
                      key={row.sprintId}
                      className="border-b border-[var(--flux-chrome-alpha-08)] last:border-0"
                    >
                      <td className="py-1.5 pr-2 font-medium text-[var(--flux-text)] line-clamp-1">{row.name}</td>
                      <td className="py-1.5 pr-2">{row.status}</td>
                      <td className="py-1.5 pr-2 tabular-nums text-[var(--flux-text-muted)] text-[10px]">
                        {row.startKey && row.endKey ? `${row.startKey} → ${row.endKey}` : t("sprintNoDates")}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {row.scopeDone}/{row.scopeTotal}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{row.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DataFadeIn>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-2.5">
      <div className="text-[10px] font-semibold uppercase text-[var(--flux-text-muted)] leading-tight">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--flux-text)] font-display">{value}</div>
      {sub ? <div className="text-[9px] text-[var(--flux-text-muted)] mt-0.5">{sub}</div> : null}
    </div>
  );
}
