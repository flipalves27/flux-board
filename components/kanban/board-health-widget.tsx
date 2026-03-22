"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { BoardHealthScore } from "@/lib/board-health-score";

type Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
};

const GRADE_COLORS: Record<string, string> = {
  A: "var(--flux-success)",
  B: "var(--flux-primary)",
  C: "var(--flux-warning)",
  D: "#f97316",
  F: "var(--flux-danger)",
};

export function BoardHealthWidget({ boardId, getHeaders }: Props) {
  const [health, setHealth] = useState<BoardHealthScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/health-score`, {
        headers: getApiHeaders(getHeadersRef.current()),
      });
      if (res.ok) {
        const data = await res.json() as { health: BoardHealthScore };
        setHealth(data.health);
      } else if (res.status === 403) {
        setError("plan");
      } else {
        setError("error");
      }
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => { void load(); }, [load]);

  if (error === "plan") return null;

  const gradeColor = health ? GRADE_COLORS[health.grade] ?? "var(--flux-text-muted)" : "var(--flux-text-muted)";

  return (
    <div className="rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--flux-chrome-alpha-04)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0 text-[var(--flux-primary)]" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-sm font-semibold text-[var(--flux-text)]">Board Health</span>
        </div>
        {loading ? (
          <div className="w-8 h-8 rounded-full bg-[var(--flux-chrome-alpha-08)] animate-pulse" />
        ) : health ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--flux-text-muted)]">{health.overall}/100</span>
            <span
              className="font-display font-bold text-xl leading-none"
              style={{ color: gradeColor }}
            >
              {health.grade}
            </span>
          </div>
        ) : null}
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`w-4 h-4 text-[var(--flux-text-muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && health && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--flux-chrome-alpha-06)]">
          {/* Dimensions */}
          <div className="pt-3 space-y-2">
            {health.dimensions.map((dim) => {
              const pct = Math.round((dim.score / dim.maxScore) * 100);
              const barColor = pct >= 80 ? "var(--flux-success)" : pct >= 60 ? "var(--flux-warning)" : "var(--flux-danger)";
              return (
                <div key={dim.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--flux-text-muted)]">{dim.name}</span>
                    <span className="text-xs font-medium" style={{ color: barColor }}>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Strengths */}
          {health.topStrengths.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-success)] mb-1">✓ Pontos fortes</p>
              {health.topStrengths.map((s, i) => (
                <p key={i} className="text-xs text-[var(--flux-text-muted)] leading-relaxed">{s}</p>
              ))}
            </div>
          )}

          {/* Issues */}
          {health.topIssues.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-warning)] mb-1">⚠ Atenção</p>
              {health.topIssues.map((s, i) => (
                <p key={i} className="text-xs text-[var(--flux-text-muted)] leading-relaxed">{s}</p>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => void load()}
            className="w-full text-xs text-[var(--flux-text-muted)] hover:text-[var(--flux-primary)] transition-colors py-1"
          >
            Atualizar
          </button>
        </div>
      )}
    </div>
  );
}
