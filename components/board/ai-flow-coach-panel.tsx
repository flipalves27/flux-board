"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiJson, getApiHeaders } from "@/lib/api-client";
import type { FlowCoachResult, CoachInsight } from "@/lib/ai-flow-coach";

type Props = {
  boardId: string;
  open: boolean;
  onClose: () => void;
  getHeaders: () => Record<string, string>;
  locale?: string;
};

const CATEGORY_ICON: Record<string, string> = {
  flow: "\u21bb",
  risk: "\u26a0",
  opportunity: "\u2191",
  team: "\u25ce",
  quality: "\u25c7",
};

const CATEGORY_COLOR: Record<string, string> = {
  flow: "var(--flux-info)",
  risk: "var(--flux-warning)",
  opportunity: "var(--flux-success)",
  team: "var(--flux-secondary)",
  quality: "var(--flux-accent)",
};

const SEVERITY_RING: Record<string, string> = {
  info: "border-[var(--flux-info)]/30 bg-[var(--flux-info)]/6",
  warning: "border-[var(--flux-warning)]/40 bg-[var(--flux-warning)]/8",
  critical: "border-[var(--flux-danger)]/40 bg-[var(--flux-danger)]/8",
};

const SCORE_COLOR = (s: number) =>
  s >= 80 ? "var(--flux-success)" : s >= 60 ? "var(--flux-info)" : s >= 40 ? "var(--flux-warning)" : "var(--flux-danger)";

function ScoreDial({ score }: { score: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const fill = (score / 100) * c;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="rotate-[-90deg]">
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--flux-chrome-alpha-10)" strokeWidth="6" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke={SCORE_COLOR(score)}
        strokeWidth="6"
        strokeDasharray={`${fill} ${c}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)" }}
      />
    </svg>
  );
}

function InsightCard({ insight, t }: { insight: CoachInsight; t: ReturnType<typeof useTranslations> }) {
  const [open, setOpen] = useState(false);
  const color = CATEGORY_COLOR[insight.category] ?? "var(--flux-primary)";

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={`w-full rounded-xl border p-3 text-left transition-all duration-200 ${SEVERITY_RING[insight.severity] ?? "border-[var(--flux-chrome-alpha-10)] bg-transparent"}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          {CATEGORY_ICON[insight.category] ?? "\u00b7"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold leading-tight text-[var(--flux-text)]">
            {insight.headline}
          </p>
          {insight.metric && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--flux-text-muted)]">{insight.metric.label}</span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
              >
                {insight.metric.value}
              </span>
              {insight.metric.trend === "up" && (
                <span className="text-[10px] text-[var(--flux-danger)]">{"\u2191"}</span>
              )}
              {insight.metric.trend === "down" && (
                <span className="text-[10px] text-[var(--flux-success)]">{"\u2193"}</span>
              )}
            </div>
          )}
        </div>
        <span
          className="shrink-0 text-[10px] text-[var(--flux-text-muted)] transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          {"\u25be"}
        </span>
      </div>
      {open && (
        <p className="mt-2 border-t border-[var(--flux-chrome-alpha-08)] pt-2 text-[11px] leading-relaxed text-[var(--flux-text-secondary)]">
          {insight.body}
        </p>
      )}
    </button>
  );
}

export function AiFlowCoachPanel({ boardId, open, onClose, getHeaders, locale = "pt-BR" }: Props) {
  const t = useTranslations("aiFlowCoach");
  const [result, setResult] = useState<FlowCoachResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ ok: boolean; result: FlowCoachResult }>(
        `/api/boards/${encodeURIComponent(boardId)}/ai-flow-coach`,
        {
          method: "POST",
          body: JSON.stringify({ locale }),
          headers: getApiHeaders(getHeaders()),
        }
      );
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setLoading(false);
    }
  }, [boardId, locale, getHeaders, t]);

  useEffect(() => {
    if (open && !hasFetched.current) {
      hasFetched.current = true;
      void fetch();
    }
    if (!open) hasFetched.current = false;
  }, [open, fetch]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[500] flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside className="relative z-10 flex h-full w-full max-w-sm flex-col overflow-hidden bg-[var(--flux-surface-elevated)] shadow-[var(--flux-shadow-modal-depth)]">
        {/* Header gradient */}
        <div
          className="relative flex items-end gap-3 px-5 pt-10 pb-5"
          style={{
            background:
              "linear-gradient(160deg, color-mix(in srgb, var(--flux-primary) 18%, var(--flux-surface-elevated)) 0%, var(--flux-surface-elevated) 100%)",
          }}
        >
          <div className="relative">
            {result ? (
              <>
                <ScoreDial score={result.score} />
                <span
                  className="absolute inset-0 flex items-center justify-center text-[15px] font-bold rotate-90"
                  style={{ color: SCORE_COLOR(result.score) }}
                >
                  {result.score}
                </span>
              </>
            ) : (
              <div className="h-[72px] w-[72px] rounded-full border-4 border-[var(--flux-chrome-alpha-10)] animate-pulse" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-primary-light)]">
              {t("pretitle")}
            </p>
            <h2 className="font-display text-lg font-bold leading-tight text-[var(--flux-text)]">
              {t("title")}
            </h2>
            {result && (
              <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold mt-1"
                style={{
                  background: `color-mix(in srgb, ${SCORE_COLOR(result.score)} 14%, transparent)`,
                  color: SCORE_COLOR(result.score),
                }}>
                {t(`scoreLabel.${result.scoreLabel}`)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-[var(--flux-rad-sm)] px-2 py-1 text-xs text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
          >
            {"\u2715"}
          </button>
        </div>

        {/* LLM Summary */}
        {result?.llmSummary && (
          <div className="mx-4 mb-3 rounded-xl border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-primary-alpha-06)] px-4 py-3">
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--flux-text-secondary)]">
              <span className="shrink-0 text-[var(--flux-primary-light)] text-[14px] leading-none">{"\u2726"}</span>
              {result.llmSummary}
            </p>
          </div>
        )}

        {/* Insights */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {loading && (
            <div className="flex flex-col gap-2 pt-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] animate-pulse"
                />
              ))}
            </div>
          )}
          {error && (
            <p className="pt-4 text-center text-sm text-[var(--flux-danger)]">{error}</p>
          )}
          {result?.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} t={t} />
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--flux-chrome-alpha-08)] px-4 py-3 flex items-center justify-between">
          <p className="text-[10px] text-[var(--flux-text-muted)]">
            {result ? t("generatedAt", { time: new Date(result.generatedAt).toLocaleTimeString(locale) }) : ""}
          </p>
          <button
            type="button"
            onClick={() => { hasFetched.current = false; void fetch(); }}
            disabled={loading}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] px-3 py-1.5 text-[11px] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)] disabled:opacity-50"
          >
            {t("refresh")}
          </button>
        </div>
      </aside>
    </div>
  );
}
