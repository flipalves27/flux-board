"use client";

type ExecutionInsights = {
  inProgress: number;
  doneRate: number;
  overdue: number;
  dueSoon: number;
};

type BoardMetricsStripProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  totalCards: number;
  executionInsights: ExecutionInsights;
};

export function BoardMetricsStrip({ t, totalCards, executionInsights }: BoardMetricsStripProps) {
  return (
    <div className="w-full px-4 sm:px-5 lg:px-6 py-2 border-t border-[var(--flux-border-muted)]">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="board-stat-tile px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("board.stats.totalLabel")}
          </div>
          <div className="text-sm font-display font-bold text-[var(--flux-text)]">{totalCards}</div>
        </div>
        <div className="board-stat-tile border-[rgba(116,185,255,0.22)] px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("board.stats.inProgressLabel")}
          </div>
          <div className="text-sm font-display font-bold text-[var(--flux-info)]">{executionInsights.inProgress}</div>
        </div>
        <div className="board-stat-tile border-[rgba(255,107,107,0.26)] px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("board.stats.overdueLabel")}
          </div>
          <div className="text-sm font-display font-bold text-[var(--flux-danger)]">{executionInsights.overdue}</div>
        </div>
        <div className="board-stat-tile border-[rgba(255,217,61,0.28)] px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("board.stats.dueSoonLabel")}
          </div>
          <div className="text-sm font-display font-bold text-[var(--flux-warning)]">{executionInsights.dueSoon}</div>
        </div>
        <div className="board-stat-tile border-[rgba(0,230,118,0.28)] px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("board.stats.completedRateLabel")}
          </div>
          <div className="text-sm font-display font-bold text-[var(--flux-success)]">{executionInsights.doneRate}%</div>
        </div>
      </div>
    </div>
  );
}
