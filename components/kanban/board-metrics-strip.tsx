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
  const tiles: Array<{
    labelKey: string;
    value: string | number;
    valueClass: string;
    borderClass: string;
  }> = [
    {
      labelKey: "board.stats.totalLabel",
      value: totalCards,
      valueClass: "text-[var(--flux-text)]",
      borderClass: "",
    },
    {
      labelKey: "board.stats.inProgressLabel",
      value: executionInsights.inProgress,
      valueClass: "text-[var(--flux-info)]",
      borderClass: "border-[var(--flux-info-alpha-22)]",
    },
    {
      labelKey: "board.stats.overdueLabel",
      value: executionInsights.overdue,
      valueClass: "text-[var(--flux-danger)]",
      borderClass: "border-[var(--flux-danger-alpha-26)]",
    },
    {
      labelKey: "board.stats.dueSoonLabel",
      value: executionInsights.dueSoon,
      valueClass: "text-[var(--flux-warning)]",
      borderClass: "border-[var(--flux-warning-alpha-28)]",
    },
    {
      labelKey: "board.stats.completedRateLabel",
      value: `${executionInsights.doneRate}%`,
      valueClass: "text-[var(--flux-success)]",
      borderClass: "border-[var(--flux-success-alpha-28)]",
    },
  ];

  return (
    <div className="w-full px-4 sm:px-5 lg:px-6 py-2 border-t border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-06)]">
      <div className="flex md:grid md:grid-cols-2 lg:grid-cols-5 gap-2 overflow-x-auto md:overflow-visible pb-0.5 md:pb-0 scrollbar-flux snap-x snap-mandatory md:snap-none">
        {tiles.map((tile) => (
          <div
            key={tile.labelKey}
            className={`board-stat-tile min-w-[min(42vw,148px)] shrink-0 snap-start px-2.5 py-2 md:min-w-0 md:snap-none md:shrink ${tile.borderClass}`}
          >
            <div className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">{t(tile.labelKey)}</div>
            <div className={`text-sm font-display font-bold ${tile.valueClass}`}>{tile.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
