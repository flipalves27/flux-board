"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";

function isOpen(c: CardData) {
  return c.progress !== "Concluída";
}

export type BoardFlowMetricsProjectionViewProps = {
  buckets: BucketConfig[];
  cards: CardData[];
  filterCard: (c: CardData) => boolean;
  onOpenCard: (card: CardData) => void;
};

export function BoardFlowMetricsProjectionView({
  buckets,
  cards,
  filterCard,
  onOpenCard,
}: BoardFlowMetricsProjectionViewProps) {
  const t = useTranslations("kanban.board.flowMetricsProjection");
  const rows = useMemo(() => {
    const visible = cards.filter(filterCard);
    const byBucket = (key: string) => visible.filter((c) => c.bucket === key && isOpen(c));
    let max = 1;
    const data = buckets.map((b) => {
      const n = byBucket(b.key).length;
      if (n > max) max = n;
      return { bucket: b, count: n, openCards: byBucket(b.key) };
    });
    return data.map((d) => ({
      ...d,
      pct: max > 0 ? Math.round((d.count / max) * 100) : 0,
    }));
  }, [buckets, cards, filterCard]);

  return (
    <div className="w-full min-w-0 max-w-4xl mx-auto space-y-3">
      <p className="text-[11px] text-[var(--flux-text-muted)] leading-relaxed">{t("hint")}</p>
      {rows.map(({ bucket, count, pct, openCards }) => (
        <div
          key={bucket.key}
          className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-3"
        >
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-sm font-semibold text-[var(--flux-text)] truncate" title={bucket.label}>
              {bucket.label}
            </span>
            <span className="text-xs tabular-nums text-[var(--flux-text-muted)] shrink-0">
              {t("openCount", { n: count })}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-[var(--flux-black-alpha-08)] overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%`, background: bucket.color ?? "var(--flux-primary)" }}
            />
          </div>
          {openCards.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {openCards.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenCard(c)}
                  className="max-w-[200px] truncate rounded-md border border-[var(--flux-control-border)] px-1.5 py-0.5 text-[10px] text-left hover:border-[var(--flux-primary-alpha-35)]"
                >
                  {c.title}
                </button>
              ))}
              {openCards.length > 6 ? (
                <span className="text-[10px] text-[var(--flux-text-muted)]">+{openCards.length - 6}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
