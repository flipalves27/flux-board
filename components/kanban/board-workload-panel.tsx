"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiPost, ApiError } from "@/lib/api-client";

type MemberWorkload = {
  name: string;
  cardCount: number;
  cards?: Array<{ id: string; title: string; bucket: string }>;
};

type Suggestion = {
  action: string;
  from?: string;
  to?: string;
  reason?: string;
};

type WorkloadResult = {
  members: MemberWorkload[];
  suggestions: Suggestion[];
  summary?: string;
};

type Props = {
  boardId: string;
  open: boolean;
  onClose: () => void;
  getHeaders: () => Record<string, string>;
};

export function BoardWorkloadPanel({ boardId, open, onClose, getHeaders }: Props) {
  const t = useTranslations("kanban");
  const [result, setResult] = useState<WorkloadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<{ workloadBalance: WorkloadResult }>(
        `/api/boards/${encodeURIComponent(boardId)}/workload-balance`,
        {},
        getHeaders(),
      );
      setResult(data.workloadBalance);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(t("board.intelligence.workloadError"));
      }
    } finally {
      setLoading(false);
    }
  }, [boardId, getHeaders, t]);

  useEffect(() => {
    if (open && !result && !loading) {
      fetchBalance();
    }
  }, [open, result, loading, fetchBalance]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const maxCount = result
    ? Math.max(1, ...result.members.map((m) => m.cardCount))
    : 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[var(--flux-z-overlay,900)] bg-black/30 transition-opacity motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        onClick={onClose}
        aria-hidden
      />

      {/* Slide-over panel */}
      <aside
        className="fixed right-0 top-0 z-[var(--flux-z-overlay,900)] flex h-full w-full max-w-md flex-col bg-[var(--flux-surface-elevated)] shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-200"
        role="dialog"
        aria-modal
        aria-label={t("board.intelligence.workloadTitle")}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--flux-border-muted)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--flux-text)]">
              {t("board.intelligence.workloadTitle")}
            </h2>
            <p className="text-[11px] text-[var(--flux-text-muted)] mt-0.5">
              {t("board.intelligence.workloadHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
            aria-label={t("board.intelligence.workloadClose")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-4 w-20 rounded bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
                  <div className="h-4 flex-1 rounded bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
                </div>
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-[var(--flux-danger,#ef4444)]/20 bg-[var(--flux-danger,#ef4444)]/5 px-4 py-3">
              <p className="text-[12px] text-[var(--flux-danger,#ef4444)]">{error}</p>
              <button
                type="button"
                onClick={fetchBalance}
                className="mt-2 text-[11px] font-semibold text-[var(--flux-primary)] hover:underline"
              >
                {t("board.intelligence.workloadRetry")}
              </button>
            </div>
          )}

          {result && !loading && (
            <>
              {/* Summary */}
              {result.summary && (
                <p className="text-[12px] text-[var(--flux-text-muted)] mb-4 leading-relaxed">
                  {result.summary}
                </p>
              )}

              {/* Member bars */}
              <div className="space-y-2.5 mb-6">
                <h3 className="text-[11px] font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">
                  {t("board.intelligence.workloadMembers")}
                </h3>
                {result.members.map((member) => {
                  const pct = Math.round((member.cardCount / maxCount) * 100);
                  return (
                    <div key={member.name} className="flex items-center gap-2">
                      <span className="w-24 truncate text-[11px] font-medium text-[var(--flux-text)] shrink-0">
                        {member.name}
                      </span>
                      <div className="flex-1 h-5 rounded bg-[var(--flux-chrome-alpha-08)] overflow-hidden">
                        <div
                          className="h-full rounded transition-all duration-500 ease-out"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              pct > 80
                                ? "var(--flux-danger, #ef4444)"
                                : pct > 50
                                  ? "var(--flux-warning, #f59e0b)"
                                  : "var(--flux-primary)",
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold tabular-nums text-[var(--flux-text-muted)] w-6 text-right shrink-0">
                        {member.cardCount}
                      </span>
                    </div>
                  );
                })}
                {result.members.length === 0 && (
                  <div className="rounded-lg border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] px-3 py-3 text-center">
                    <div className="mx-auto mb-1.5 h-8 w-8 rounded-full border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-hover)] flex items-center justify-center text-[var(--flux-text-muted)]">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                    </div>
                    <p className="text-[11px] text-[var(--flux-text-muted)] italic">{t("board.intelligence.workloadEmpty")}</p>
                  </div>
                )}
              </div>

              {/* Suggestions */}
              {result.suggestions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[11px] font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">
                    {t("board.intelligence.workloadSuggestions")}
                  </h3>
                  {result.suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-primary-alpha-08)] px-3.5 py-2.5"
                    >
                      <p className="text-[12px] text-[var(--flux-text)] leading-relaxed">
                        {s.action}
                      </p>
                      {s.from && s.to && (
                        <p className="text-[10px] text-[var(--flux-text-muted)] mt-1">
                          {s.from} → {s.to}
                        </p>
                      )}
                      {s.reason && (
                        <p className="text-[10px] text-[var(--flux-text-muted)] mt-0.5 italic">
                          {s.reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Refresh */}
              <button
                type="button"
                onClick={fetchBalance}
                className="mt-4 rounded-lg border border-[var(--flux-chrome-alpha-14)] px-3 py-1.5 text-[11px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)] transition-colors"
              >
                {t("board.intelligence.workloadRefresh")}
              </button>
            </>
          )}
        </div>
      </aside>

    </>
  );
}
