"use client";

import Link from "next/link";
import type { SprintData } from "@/lib/schemas";

export type BoardActiveSprintContextProps = {
  boardId: string;
  locale: string;
  sprint: SprintData;
  sprintProgress: { done: number; total: number; pct: number };
  sprintScopeOnly: boolean;
  toggleSprintScopeOnly: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

function formatSprintDates(
  locale: string,
  start: string | null,
  end: string | null,
  t: BoardActiveSprintContextProps["t"]
): string | null {
  if (!start && !end) return null;
  const fmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  const yFmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" });
  if (start && end) {
    const a = new Date(`${start}T12:00:00`);
    const b = new Date(`${end}T12:00:00`);
    return t("board.sprintContext.dateRange", {
      start: yFmt.format(a),
      end: yFmt.format(b),
    });
  }
  if (start) {
    return t("board.sprintContext.dateStartOnly", { start: fmt.format(new Date(`${start}T12:00:00`)) });
  }
  return t("board.sprintContext.dateEndOnly", { end: fmt.format(new Date(`${end}T12:00:00`)) });
}

export function BoardActiveSprintContext({
  boardId,
  locale,
  sprint,
  sprintProgress,
  sprintScopeOnly,
  toggleSprintScopeOnly,
  t,
}: BoardActiveSprintContextProps) {
  const localeRoot = `/${locale}`;
  const ccHref = `${localeRoot}/sprints/${encodeURIComponent(boardId)}/${encodeURIComponent(sprint.id)}/command-center`;
  const dateLine = formatSprintDates(locale, sprint.startDate, sprint.endDate, t);
  const scopeLabel =
    sprintProgress.total === 0
      ? t("board.sprintContext.countsEmpty")
      : t("board.sprintContext.counts", {
          inScope: sprintProgress.total,
          done: sprintProgress.done,
        });
  const emptyHint = sprintProgress.total === 0 ? t("board.sprintContext.emptyScopeHint") : null;

  return (
    <section
      aria-label={t("board.sprintContext.regionAria", { name: sprint.name })}
      className="flex min-h-[38px] min-w-0 flex-wrap items-center gap-2 border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-04)] px-4 py-1.5 sm:gap-3 sm:px-5 lg:px-6"
    >
      <div className="h-6 w-[3px] shrink-0 rounded-full bg-[var(--flux-primary)]" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span className="truncate text-flux-sm font-semibold text-[var(--flux-text)]" title={sprint.name}>
            {sprint.name}
          </span>
          {dateLine ? (
            <span className="shrink-0 text-flux-xs text-[var(--flux-text-muted)] tabular-nums">{dateLine}</span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-flux-xs text-[var(--flux-text-muted)]">
          <span className="tabular-nums">{scopeLabel}</span>
          {emptyHint ? <span className="hidden text-[var(--flux-text-muted)] sm:inline">{emptyHint}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={ccHref}
          className="text-flux-xs font-semibold text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
        >
          {t("board.sprintContext.commandCenter")}
        </Link>
        <button
          type="button"
          onClick={toggleSprintScopeOnly}
          className={`rounded-lg border px-2 py-1 text-flux-xs font-semibold transition-colors ${
            sprintScopeOnly
              ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
              : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
          }`}
          title={t("board.filters.sprintFilterHint")}
        >
          {sprintScopeOnly ? t("board.filters.sprintAll") : t("board.filters.sprintOnly")}
        </button>
      </div>
    </section>
  );
}
