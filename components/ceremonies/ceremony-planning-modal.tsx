"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { monteCarloThroughputPercentiles } from "@/lib/sprint-prediction-metrics";
import { computeRoughCapacityPoints, countWeekdaysInclusive } from "@/lib/sprint-planning-capacity";
import type { SprintData } from "@/lib/schemas";
import { useCeremonyStore } from "@/stores/ceremony-store";
import { useSprintStore } from "@/stores/sprint-store";
import { SprintBacklogPicker } from "@/components/kanban/sprint-backlog-picker";

type AiSuggestion = {
  summary: string;
  recommendedCardIds: string[];
  reasoning: string;
};

export default function CeremonyPlanningModal({ getHeaders }: { getHeaders: () => Record<string, string> }) {
  const t = useTranslations("ceremonies");
  const tp = useTranslations("sprints.panel");
  const open = useCeremonyStore((s) => s.planningModalOpen);
  const boardId = useCeremonyStore((s) => s.planningBoardId);
  const sprintId = useCeremonyStore((s) => s.planningSprintId);
  const close = useCeremonyStore((s) => s.closePlanning);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useModalA11y({ open, onClose: close, containerRef: dialogRef, initialFocusRef: closeBtnRef });

  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  const [loading, setLoading] = useState(false);
  const [sprint, setSprint] = useState<SprintData | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState<AiSuggestion | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const upsertSprint = useSprintStore((s) => s.upsertSprint);

  const load = useCallback(async () => {
    if (!open || !boardId || !sprintId) return;
    setLoading(true);
    setErr(null);
    setAi(null);
    setAiErr(null);
    try {
      const [sr, mr] = await Promise.all([
        apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprintId)}`, {
          headers: getApiHeaders(getHeadersRef.current()),
        }),
        apiFetch(`/api/boards/${encodeURIComponent(boardId)}/members`, {
          headers: getApiHeaders(getHeadersRef.current()),
        }),
      ]);
      if (!sr.ok) {
        setErr(t("error"));
        setSprint(null);
        return;
      }
      const sd = (await sr.json()) as { sprint: SprintData };
      setSprint(sd.sprint);
      if (mr.ok) {
        const md = (await mr.json()) as { members?: unknown[] };
        setMemberCount(Array.isArray(md.members) ? md.members.length : 0);
      } else {
        setMemberCount(1);
      }
    } catch {
      setErr(t("error"));
      setSprint(null);
    } finally {
      setLoading(false);
    }
  }, [open, boardId, sprintId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onBacklogUpdated = useCallback(
    (s: SprintData) => {
      setSprint(s);
      if (boardId) upsertSprint(boardId, s);
    },
    [boardId, upsertSprint]
  );

  const patchSprintCardIds = useCallback(
    async (sid: string, cardIds: string[]) => {
      if (!boardId) return;
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sid)}`, {
        method: "PATCH",
        headers: { ...getApiHeaders(getHeadersRef.current()), "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds }),
      });
      if (res.ok) {
        const data = (await res.json()) as { sprint: SprintData };
        onBacklogUpdated(data.sprint);
      }
    },
    [boardId, onBacklogUpdated]
  );

  const applyAiSuggestion = useCallback(
    async (mode: "merge" | "replace") => {
      if (!sprintId || !sprint || !ai?.recommendedCardIds?.length || sprint.status !== "planning") return;
      const rec = ai.recommendedCardIds.map((id) => id.trim()).filter(Boolean);
      const next = mode === "replace" ? rec : Array.from(new Set([...sprint.cardIds, ...rec]));
      await patchSprintCardIds(sprintId, next);
    },
    [ai, patchSprintCardIds, sprint, sprintId]
  );

  const runAi = async () => {
    if (!boardId || !sprintId) return;
    setAiLoading(true);
    setAi(null);
    setAiErr(null);
    try {
      const res = await apiFetch(
        `/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprintId)}/planning-ai`,
        { method: "POST", headers: getApiHeaders(getHeadersRef.current()) }
      );
      if (!res.ok) {
        setAiErr(t("aiError"));
        return;
      }
      const data = (await res.json()) as { suggestion?: AiSuggestion };
      if (data.suggestion) setAi(data.suggestion);
      else setAiErr(t("aiError"));
    } catch {
      setAiErr(t("aiError"));
    } finally {
      setAiLoading(false);
    }
  };

  if (!open || !boardId || !sprintId) return null;

  const start = sprint?.startDate ?? null;
  const end = sprint?.endDate ?? null;
  const weekdays =
    start && end ? countWeekdaysInclusive(start, end) : 10;
  const capacity = computeRoughCapacityPoints({
    memberCount: Math.max(1, memberCount),
    sprintWeekdays: Math.max(1, weekdays),
  });
  const committed = sprint?.cardIds?.length ?? 0;
  const over = committed > capacity && capacity > 0;
  const weeklyHint = [Math.max(1, Math.floor(capacity / 2)), Math.max(1, committed)];
  const mc = monteCarloThroughputPercentiles(weeklyHint, 400);

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" aria-hidden onClick={close} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg sm:max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-modal-depth)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--flux-chrome-alpha-08)] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--flux-text)]">{t("planningTitle")}</h2>
            <p className="mt-0.5 text-xs text-[var(--flux-text-muted)]">{t("planningSubtitle")}</p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={close}
            className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-2 py-1 text-xs text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
          >
            {t("close")}
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {loading ? <p className="text-[var(--flux-text-muted)]">{t("loading")}</p> : null}
          {err ? <p className="text-[var(--flux-danger)]">{err}</p> : null}
          {!loading && sprint ? (
            <>
              <details className="rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-xs group">
                <summary className="cursor-pointer font-semibold text-[var(--flux-text)] list-none flex items-center justify-between gap-2">
                  <span>{t("scrumPlaybookTitle")}</span>
                  <span className="text-[var(--flux-text-muted)] group-open:rotate-90 transition-transform">›</span>
                </summary>
                <p className="mt-2 text-[var(--flux-text-muted)] leading-relaxed border-t border-[var(--flux-chrome-alpha-06)] pt-2">{t("scrumPlaybookBody")}</p>
              </details>
              <p className="text-xs text-[var(--flux-text-muted)]">{t("planningBacklogIntro")}</p>
              <div className="rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-3">
                <SprintBacklogPicker
                  boardId={boardId!}
                  sprint={sprint}
                  getHeaders={() => getHeadersRef.current()}
                  onSprintUpdated={onBacklogUpdated}
                  compact
                />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <dt className="text-[var(--flux-text-muted)]">{t("members")}</dt>
                <dd className="font-semibold text-[var(--flux-text)]">{memberCount}</dd>
                <dt className="text-[var(--flux-text-muted)]">{t("weekdays")}</dt>
                <dd className="font-semibold text-[var(--flux-text)]">{weekdays}</dd>
                <dt className="text-[var(--flux-text-muted)]">{t("capacity")}</dt>
                <dd className="font-semibold text-[var(--flux-text)]">{capacity}</dd>
                <dt className="text-[var(--flux-text-muted)]">{t("committed")}</dt>
                <dd className="font-semibold text-[var(--flux-text)]">{committed}</dd>
              </dl>
              {over ? (
                <p className="rounded-lg border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-08)] px-3 py-2 text-xs text-[var(--flux-text)]">
                  {t("overCommitted")}
                </p>
              ) : null}
              <div className="rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-xs">
                <p className="font-semibold text-[var(--flux-text)]">{t("monteCarloHint")}</p>
                <p className="mt-1 text-[var(--flux-text-muted)]">
                  {t("p85")}: <span className="font-mono text-[var(--flux-primary-light)]">{mc.p85}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={aiLoading}
                onClick={() => void runAi()}
                className="w-full rounded-lg bg-[var(--flux-primary)] py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {aiLoading ? t("aiLoading") : t("aiSuggest")}
              </button>
              {aiErr ? <p className="text-xs text-[var(--flux-danger)]">{aiErr}</p> : null}
              {ai ? (
                <div className="space-y-2 rounded-lg border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-primary-alpha-04)] p-3 text-xs">
                  <p className="font-semibold text-[var(--flux-primary-light)]">{ai.summary}</p>
                  <p className="text-[var(--flux-text-muted)]">{ai.reasoning}</p>
                  {ai.recommendedCardIds.length > 0 ? (
                    <p className="text-[11px] text-[var(--flux-text-muted)] font-mono break-all">
                      {ai.recommendedCardIds.join(", ")}
                    </p>
                  ) : null}
                  {sprint.status === "planning" && ai.recommendedCardIds.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void applyAiSuggestion("merge")}
                        className="flex-1 rounded-lg border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary)] px-2 py-1.5 text-[10px] font-semibold text-white hover:opacity-95"
                      >
                        {tp("applyAiMerge")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void applyAiSuggestion("replace")}
                        className="flex-1 rounded-lg border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-12)] px-2 py-1.5 text-[10px] font-semibold text-[var(--flux-warning)] hover:bg-[var(--flux-warning-alpha-18)]"
                      >
                        {tp("applyAiReplace")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
