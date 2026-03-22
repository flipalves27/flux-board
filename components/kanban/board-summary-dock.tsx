"use client";

import type { BucketConfig, CardData } from "@/app/board/[id]/page";
import type { OkrsObjectiveComputed } from "@/lib/okr-engine";
import type { OkrKrProjection } from "@/lib/okr-projection";
import { DIR_COLORS } from "./kanban-constants";

type BoardSummaryDockProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  buckets: BucketConfig[];
  visibleCardsByBucket: (key: string) => CardData[];
  cards: CardData[];
  directions: string[];
  directionCounts: Record<string, number>;
  totalWithDir: number;
  okrObjectivesLength: number;
  okrLoadError: string | null;
  okrProjectionError: string | null;
  currentQuarter: string;
  okrsComputed: OkrsObjectiveComputed[];
  okrProjectionByKrId: Map<string, OkrKrProjection>;
};

export function BoardSummaryDock({
  t,
  buckets,
  visibleCardsByBucket,
  cards,
  directions,
  directionCounts,
  totalWithDir,
  okrObjectivesLength,
  okrLoadError,
  okrProjectionError,
  currentQuarter,
  okrsComputed,
  okrProjectionByKrId,
}: BoardSummaryDockProps) {
  return (
    <div className="board-summary-dock rounded-t-[var(--flux-rad)] border-t border-x border-[var(--flux-border-default)] py-2.5 px-5 sm:px-6 lg:px-8 z-[var(--flux-z-board-summary-dock)] max-w-[1200px] mx-auto">
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

      {(okrObjectivesLength > 0 || Boolean(okrLoadError)) && (
        <div className="mt-3 border-t border-[var(--flux-border-subtle)] pt-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
              Flux Goals (OKRs) — {currentQuarter}
            </div>
            <div className="text-[9px] text-[var(--flux-text-muted)] text-right max-w-[200px] leading-snug">
              IA: projeção linear (últimas 4 sem., throughput Copilot) + alerta se &lt;80% ao fim do quarter.
            </div>
          </div>

          <div className="space-y-3">
            {okrsComputed.map((o) => (
              <div
                key={o.objective.id}
                className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-24)] bg-[var(--flux-surface-card)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-display font-bold text-[var(--flux-text)] truncate">{o.objective.title}</div>
                    <div className="text-[10px] text-[var(--flux-text-muted)] mt-0.5">Status: {o.status}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display font-bold text-xs text-[var(--flux-text)]">{o.objectiveCurrentPct}%</div>
                    <div className="text-[10px] text-[var(--flux-text-muted)]">min dos KRs</div>
                  </div>
                </div>

                <div className="mt-2 h-2 rounded-full bg-[var(--flux-border-muted)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--flux-primary)] transition-[width] duration-200"
                    style={{ width: `${o.objectiveCurrentPct}%` }}
                  />
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-[var(--flux-secondary)] font-semibold select-none">
                    Ver KRs ({o.keyResults.length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {o.keyResults.map((kr) => {
                      const proj = okrProjectionByKrId.get(kr.definition.id);
                      return (
                        <div
                          key={kr.definition.id}
                          className={`border rounded-md bg-[var(--flux-surface-hover)] p-2 ${
                            proj?.riskBelowThreshold
                              ? "border-[var(--flux-danger-alpha-45)] bg-[var(--flux-danger-soft-06)]"
                              : "border-[var(--flux-border-subtle)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold text-[var(--flux-text)] truncate">
                                {kr.definition.title}
                              </div>
                              {kr.linkBroken ? (
                                <div className="text-[10px] text-[var(--flux-danger)] mt-0.5">Link quebrado (coluna removida)</div>
                              ) : (
                                <div className="text-[10px] text-[var(--flux-text-muted)] mt-0.5">{kr.status}</div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="font-display font-bold text-[11px] text-[var(--flux-text)]">{kr.pct}%</div>
                              <div className="text-[10px] text-[var(--flux-text-muted)]">
                                {kr.current} / {kr.definition.target}
                              </div>
                              {proj && (
                                <div className="text-[9px] text-[var(--flux-text-muted)] mt-0.5">
                                  proj. fim Q: ~{proj.projectedPctAtQuarterEnd}%
                                </div>
                              )}
                            </div>
                          </div>
                          {proj && (
                            <div className="mt-1.5 space-y-0.5">
                              <div
                                className={`text-[10px] leading-snug ${
                                  proj.riskBelowThreshold ? "text-[var(--flux-danger)] font-semibold" : "text-[var(--flux-text)]"
                                }`}
                              >
                                {proj.summaryLine}
                              </div>
                              <div className="text-[9px] text-[var(--flux-text-muted)] leading-snug">{proj.detailLine}</div>
                            </div>
                          )}
                          <div className="mt-1 h-1.5 rounded-full bg-[var(--flux-border-muted)] overflow-hidden">
                            <div
                              className="h-full bg-[var(--flux-secondary)] transition-[width] duration-200"
                              style={{ width: `${kr.pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            ))}
          </div>

          {okrLoadError && <div className="mt-2 text-[10px] text-[var(--flux-danger)]">{okrLoadError}</div>}
          {okrProjectionError && <div className="mt-2 text-[10px] text-[var(--flux-danger)]">{okrProjectionError}</div>}
        </div>
      )}
    </div>
  );
}
