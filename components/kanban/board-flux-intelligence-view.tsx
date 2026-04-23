"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { FluxInsight } from "@/lib/insights/flux-intelligence";
import type { BoardDecisionRecord } from "@/lib/kv-board-decisions";
import { BoardDependencyTimeline } from "@/components/kanban/board-dependency-timeline";

type BoardPayload = {
  id: string;
  name: string;
  cards?: Array<{
    id: string;
    title: string;
    bucket?: string;
    progress?: string;
    blockedBy?: string[];
  }>;
};

export function BoardFluxIntelligenceView({
  boardId,
  getHeaders,
}: {
  boardId: string;
  getHeaders: () => Record<string, string>;
}) {
  const t = useTranslations("kanban.fluxIntelligence");
  const locale = useLocale();

  const [tab, setTab] = useState<"insights" | "deps" | "decisions">("insights");
  const [insights, setInsights] = useState<FluxInsight[]>([]);
  const [board, setBoard] = useState<BoardPayload | null>(null);
  const [decisions, setDecisions] = useState<BoardDecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [dTitle, setDTitle] = useState("");
  const [dContext, setDContext] = useState("");
  const [dDecision, setDDecision] = useState("");
  const [dSimilar, setDSimilar] = useState<BoardDecisionRecord[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [bRes, iRes, decRes] = await Promise.all([
        apiFetch(`/api/boards/${encodeURIComponent(boardId)}`, { headers: getApiHeaders(getHeaders()) }),
        apiFetch(`/api/boards/${encodeURIComponent(boardId)}/flux-intelligence`, { headers: getApiHeaders(getHeaders()) }),
        apiFetch(`/api/boards/${encodeURIComponent(boardId)}/decisions`, { headers: getApiHeaders(getHeaders()) }),
      ]);
      if (bRes.ok) {
        const b = (await bRes.json()) as BoardPayload;
        setBoard(b);
      }
      if (iRes.ok) {
        const j = (await iRes.json()) as { insights: FluxInsight[] };
        setInsights(j.insights ?? []);
      }
      if (decRes.ok) {
        const j = (await decRes.json()) as { decisions: BoardDecisionRecord[] };
        setDecisions(j.decisions ?? []);
      } else if (decRes.status === 503) {
        setDecisions([]);
      }
    } catch {
      setErr(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [boardId, getHeaders, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDecision = useCallback(async () => {
    setSaving(true);
    setDSimilar([]);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/decisions`, {
        method: "POST",
        headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: dTitle,
          context: dContext,
          decision: dDecision,
          similarQuery: dContext || dTitle,
        }),
      });
      const data = (await res.json()) as { decision?: BoardDecisionRecord; similar?: BoardDecisionRecord[]; error?: string };
      if (!res.ok) {
        setErr(data.error ?? t("saveError"));
        return;
      }
      if (data.decision) setDecisions((prev) => [data.decision!, ...prev]);
      setDSimilar(data.similar ?? []);
      setDTitle("");
      setDContext("");
      setDDecision("");
    } catch {
      setErr(t("saveError"));
    } finally {
      setSaving(false);
    }
  }, [boardId, dContext, dDecision, dTitle, getHeaders, t]);

  const severityDot = (s: FluxInsight["severity"]) => {
    if (s === "critical") return "🔴";
    if (s === "warning") return "🟡";
    return "🟢";
  };

  const boardHref = `/${locale}/board/${encodeURIComponent(boardId)}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">{t("title")}</h1>
          <p className="text-sm text-[var(--flux-text-muted)] mt-1">{board?.name ?? boardId}</p>
        </div>
        <Link href={boardHref} className="btn-secondary text-sm">
          ← {t("backToBoard")}
        </Link>
      </div>

      <p className="text-xs text-[var(--flux-text-muted)] leading-relaxed border border-[var(--flux-chrome-alpha-10)] rounded-lg px-3 py-2 bg-[var(--flux-chrome-alpha-03)]">
        {t("packageIntro")}
      </p>

      <div className="flex flex-wrap gap-2 border-b border-[var(--flux-chrome-alpha-12)] pb-2">
        {(
          [
            ["insights", t("tabInsights")],
            ["deps", t("tabDeps")],
            ["decisions", t("tabDecisions")],
          ] as const
        ).map(([k, lab]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === k
                ? "bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)] border border-[var(--flux-primary-alpha-35)]"
                : "text-[var(--flux-text-muted)] border border-transparent hover:bg-[var(--flux-chrome-alpha-06)]"
            }`}
          >
            {lab}
          </button>
        ))}
      </div>

      {err ? <p className="text-sm text-[var(--flux-danger)]">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p>
      ) : tab === "insights" ? (
        <div className="space-y-4">
          <p className="text-xs text-[var(--flux-text-muted)]">{t("insightsHint")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {insights.map((ins) => (
              <article
                key={ins.id}
                className="rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4 shadow-sm"
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg" aria-hidden>
                    {severityDot(ins.severity)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm text-[var(--flux-text)]">{ins.title}</h3>
                    <p className="mt-1 text-xs text-[var(--flux-text-muted)] leading-relaxed">{ins.description}</p>
                    <p className="mt-2 text-[11px] text-[var(--flux-primary-light)]">{ins.suggestedAction}</p>
                    <p className="mt-2 text-[10px] text-[var(--flux-text-muted)] tabular-nums">
                      {t("generatedAt")} {new Date(ins.generatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : tab === "deps" ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--flux-text-muted)]">{t("depsHint")}</p>
          <BoardDependencyTimeline cards={board?.cards ?? []} />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] p-4">
            <h3 className="text-sm font-semibold text-[var(--flux-text)]">{t("newDecision")}</h3>
            <input
              className="w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm"
              placeholder={t("fieldTitle")}
              value={dTitle}
              onChange={(e) => setDTitle(e.target.value)}
            />
            <textarea
              className="w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm min-h-[72px]"
              placeholder={t("fieldContext")}
              value={dContext}
              onChange={(e) => setDContext(e.target.value)}
            />
            <textarea
              className="w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm min-h-[88px]"
              placeholder={t("fieldDecision")}
              value={dDecision}
              onChange={(e) => setDDecision(e.target.value)}
            />
            <button type="button" className="btn-primary text-sm w-full" disabled={saving} onClick={() => void saveDecision()}>
              {saving ? "…" : t("saveDecision")}
            </button>
            {dSimilar.length > 0 ? (
              <div className="rounded-lg border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-primary-alpha-08)] p-3">
                <p className="text-[11px] font-semibold text-[var(--flux-primary-light)] mb-2">{t("similarTitle")}</p>
                <ul className="space-y-2">
                  {dSimilar.map((s) => (
                    <li key={s.id} className="text-[11px] text-[var(--flux-text)]">
                      <span className="font-medium">{s.title}</span> — {s.decision.slice(0, 120)}…
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--flux-text)]">{t("history")}</h3>
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-kanban">
              {decisions.map((d) => (
                <li key={d.id} className="rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-3 text-xs">
                  <p className="font-semibold text-[var(--flux-text)]">{d.title}</p>
                  <p className="text-[var(--flux-text-muted)] mt-1">{d.decision.slice(0, 220)}</p>
                </li>
              ))}
              {decisions.length === 0 ? <li className="text-xs text-[var(--flux-text-muted)]">{t("noDecisions")}</li> : null}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
