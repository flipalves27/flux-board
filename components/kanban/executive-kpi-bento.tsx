"use client";

import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";
import type { ExecutivePresentationFlowMetrics } from "@/lib/executive-presentation-metrics";

type TFn = (key: string, values?: Record<string, number | string>) => string;

type Props = {
  portfolio: BoardPortfolioMetrics;
  flow: ExecutivePresentationFlowMetrics;
  attention: number;
  inProgress: number;
  queued: number;
  t: TFn;
};

function KpiCell({
  value,
  label,
  hint,
  warn,
}: {
  value: number | string | null;
  label: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[88px] min-w-0 flex-1 flex-col justify-between gap-1 rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 ${
        warn
          ? "border-[var(--flux-warning)]/40 bg-[var(--flux-warning)]/5"
          : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)]"
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">{label}</span>
      <span className="text-xl font-semibold tabular-nums text-[var(--flux-text)] sm:text-2xl">
        {value == null || value === "" ? "—" : value}
      </span>
      <span className="text-[10px] leading-snug text-[var(--flux-text-muted)]">{hint}</span>
    </div>
  );
}

export function ExecutiveKpiBento({ portfolio, flow, attention, inProgress, queued, t }: Props) {
  const wipSummary =
    flow.bucketsWithWipLimit === 0
      ? "—"
      : flow.columnsOverWip > 0
        ? t("wipOverSummary", { over: flow.columnsOverWip, total: flow.bucketsWithWipLimit })
        : t("wipOkSummary", { total: flow.bucketsWithWipLimit });

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCell value={portfolio.risco} label={t("resilience")} hint={t("resilienceHint")} />
      <KpiCell value={portfolio.throughput} label={t("momentum")} hint={t("momentumHint")} />
      <KpiCell value={portfolio.previsibilidade} label={t("predictability")} hint={t("predictabilityHint")} />
      <KpiCell
        value={attention}
        label={t("attention")}
        hint={t("attentionHint")}
        warn={attention > 0}
      />
      <KpiCell
        value={t("flowMixValue", { active: inProgress, queued })}
        label={t("flowMix")}
        hint={t("flowMixHint")}
      />
      <KpiCell
        value={wipSummary}
        label={t("wipHeadline")}
        hint={t("wipHint")}
        warn={flow.columnsOverWip > 0}
      />
    </div>
  );
}
