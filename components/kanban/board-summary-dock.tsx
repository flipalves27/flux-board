"use client";

import type { BucketConfig, CardData } from "@/app/board/[id]/page";
import { DIR_COLORS } from "./kanban-constants";

type BoardSummaryDockProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  buckets: BucketConfig[];
  visibleCardsByBucket: (key: string) => CardData[];
  cards: CardData[];
  directions: string[];
  directionCounts: Record<string, number>;
  totalWithDir: number;
};

export function BoardSummaryDock({
  t,
  buckets,
  visibleCardsByBucket,
  cards,
  directions,
  directionCounts,
  totalWithDir,
}: BoardSummaryDockProps) {
  return (
    <div className="board-summary-dock w-full max-w-full sm:max-w-[1200px] rounded-t-[var(--flux-rad)] border-t border-x border-[var(--flux-border-default)] py-2 px-3 sm:py-2.5 sm:px-6 lg:px-8 z-[var(--flux-z-board-summary-dock)] mx-auto box-border">
      <div className="w-full flex flex-col md:flex-row items-center justify-center gap-3 md:gap-6 text-center">
        <div className="flex items-center justify-center gap-2 overflow-x-auto flex-wrap min-w-0 scrollbar-flux pb-1">
          {buckets.map((b, i) => {
            const n = visibleCardsByBucket(b.key).length;
            return (
              <div key={b.key} className="flex items-center gap-1 shrink-0">
                {i > 0 && <div className="w-px h-4 bg-[var(--flux-hairline)]" />}
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: b.color || "var(--flux-text-muted)" }} />
                  <span className="text-xs text-[var(--flux-text-muted)] font-medium whitespace-nowrap">
                    {b.label || ""}
                  </span>
                  <span className="font-display font-bold text-xs text-[var(--flux-text)]">{n}</span>
                </div>
              </div>
            );
          })}
          <div className="w-px h-4 bg-[var(--flux-hairline)] shrink-0" />
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs font-bold text-[var(--flux-text-muted)]">{t("board.summary.totalLabel")}</span>
            <span className="font-display font-bold text-xs text-[var(--flux-secondary)]">{cards.length}</span>
          </div>
        </div>

        {totalWithDir > 0 && (
          <div className="flex items-center justify-center gap-4 flex-wrap text-xs">
            {directions.map((d, i) => (
              <div key={d} className="flex items-center gap-2">
                {i > 0 && <div className="w-px h-4 bg-[var(--flux-text-muted)]/60" />}
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: DIR_COLORS[d.toLowerCase()] }} />
                <span className="font-display font-bold text-[var(--flux-text)]">
                  {directionCounts[d.toLowerCase()] || 0}
                </span>
                <span className="text-[var(--flux-text-muted)] font-medium">
                  {(() => {
                    const dk = d.toLowerCase();
                    try {
                      return t(`directions.${dk}`);
                    } catch {
                      return d;
                    }
                  })()}
                </span>
              </div>
            ))}
            <div className="w-px h-4 bg-[var(--flux-text-muted)]/60" />
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-[var(--flux-text-muted)]">{cards.length - totalWithDir}</span>
              <span className="text-[var(--flux-text-muted)] font-medium">{t("board.summary.pendingLabel")}</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
