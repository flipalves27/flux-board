"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, ApiError } from "@/lib/api-client";
import type { SprintData } from "@/lib/schemas";
import type { SprintWithBoardName } from "@/lib/sprints-org-overview";
import { useCeremonyStore } from "@/stores/ceremony-store";
import { KanbanCadencePanel } from "@/components/ceremonies/kanban-cadence-panel";

type Props = {
  getHeaders: () => Record<string, string>;
};

function SprintStatusText({ status }: { status: SprintData["status"] }) {
  const t = useTranslations("sprints.status");
  return <>{t(status)}</>;
}

export function SprintsHub({ getHeaders }: Props) {
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("sprints");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SprintWithBoardName[]>([]);
  const [boardSummaries, setBoardSummaries] = useState<Array<{ id: string; name: string; boardMethodology?: "scrum" | "kanban" }>>(
    []
  );
  const openRetro = useCeremonyStore((s) => s.openRetro);
  const openReview = useCeremonyStore((s) => s.openReview);
  const openPlanning = useCeremonyStore((s) => s.openPlanning);
  const openStandup = useCeremonyStore((s) => s.openStandup);
  const [hubMode, setHubMode] = useState<"scrum" | "kanban">("scrum");
  const [cadenceBoardId, setCadenceBoardId] = useState<string | null>(null);

  const boardsUnique = useMemo(() => {
    if (boardSummaries.length > 0) return boardSummaries;
    const m = new Map<string, { id: string; name: string; boardMethodology?: "scrum" | "kanban" }>();
    for (const r of rows) {
      if (!m.has(r.boardId)) {
        m.set(r.boardId, { id: r.boardId, name: r.boardName, boardMethodology: r.boardMethodology });
      }
    }
    return [...m.values()];
  }, [boardSummaries, rows]);

  /** Prefer boards marcados como Kanban para o painel de cadência; senão, qualquer board acessível. */
  const cadenceBoardCandidates = useMemo(() => {
    const kanbanOnly = boardsUnique.filter((b) => b.boardMethodology === "kanban");
    return kanbanOnly.length > 0 ? kanbanOnly : boardsUnique;
  }, [boardsUnique]);

  useEffect(() => {
    if (cadenceBoardCandidates.length === 0) {
      setCadenceBoardId(null);
      return;
    }
    setCadenceBoardId((prev) => {
      if (prev && cadenceBoardCandidates.some((b) => b.id === prev)) return prev;
      return cadenceBoardCandidates[0]!.id;
    });
  }, [cadenceBoardCandidates]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{
        sprints: SprintWithBoardName[];
        boards?: Array<{ id: string; name: string; boardMethodology?: "scrum" | "kanban" }>;
      }>("/api/sprints", getHeaders());
      setRows(Array.isArray(data?.sprints) ? data.sprints : []);
      setBoardSummaries(Array.isArray(data?.boards) ? data.boards : []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setError(t("upgradeRequired"));
      } else if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setError(t("authError"));
      } else {
        setError(t("loadError"));
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [getHeaders, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeList = useMemo(() => rows.filter((s) => s.status === "active"), [rows]);
  const primaryActive = activeList[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--flux-text-muted)]">{t("subtitle")}</p>
        {!loading && !error ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-[var(--flux-text-muted)]">{t("hubFocus")}</span>
            <div className="inline-flex rounded-lg border border-[var(--flux-chrome-alpha-12)] p-0.5 bg-[var(--flux-surface-elevated)]">
              <button
                type="button"
                onClick={() => setHubMode("scrum")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  hubMode === "scrum"
                    ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("hubModeScrum")}
              </button>
              <button
                type="button"
                onClick={() => setHubMode("kanban")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  hubMode === "kanban"
                    ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("hubModeKanban")}
              </button>
            </div>
            <p className="w-full text-[11px] text-[var(--flux-text-muted)] sm:w-auto sm:ml-1">
              {hubMode === "scrum" ? t("hubCadenceHintScrum") : t("hubCadenceHintKanban")}
            </p>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-08)] px-4 py-3 text-sm text-[var(--flux-text)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p>
      ) : null}

      {!loading && !error && hubMode === "kanban" && cadenceBoardCandidates.length > 0 && cadenceBoardId ? (
        <section className="space-y-3">
          <label className="flex flex-col gap-1 text-[11px] text-[var(--flux-text-muted)] max-w-md">
            {t("cadencePickBoard")}
            <select
              value={cadenceBoardId}
              onChange={(e) => setCadenceBoardId(e.target.value)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-2 text-sm text-[var(--flux-text)]"
            >
              {cadenceBoardCandidates.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <KanbanCadencePanel
            boardId={cadenceBoardId}
            boardLabel={cadenceBoardCandidates.find((b) => b.id === cadenceBoardId)?.name ?? cadenceBoardId}
            getHeaders={getHeaders}
          />
        </section>
      ) : null}

      {!loading && !error && hubMode === "scrum" && primaryActive ? (
        <section className="rounded-2xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-primary-alpha-06)] p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">{t("activeSprint")}</h2>
          <p className="font-display text-lg font-bold text-[var(--flux-text)]">{primaryActive.name}</p>
          <p className="text-sm text-[var(--flux-text-muted)]">
            {primaryActive.boardName}
            {primaryActive.startDate && primaryActive.endDate
              ? ` · ${primaryActive.startDate} → ${primaryActive.endDate}`
              : null}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href={`${localeRoot}/board/${encodeURIComponent(primaryActive.boardId)}`}
              className="rounded-lg bg-[var(--flux-primary)] px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
            >
              {t("openBoard")}
            </Link>
            <button
              type="button"
              onClick={() => openPlanning(primaryActive.boardId, primaryActive.id)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
            >
              {t("ceremony.planning")}
            </button>
            <button
              type="button"
              onClick={() => openStandup(primaryActive.boardId, primaryActive.id)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
            >
              {t("ceremony.standup")}
            </button>
            <button
              type="button"
              onClick={() => openReview(primaryActive.boardId, primaryActive.id)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
            >
              {t("ceremony.review")}
            </button>
            <button
              type="button"
              onClick={() => openRetro(primaryActive.boardId, primaryActive.id)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
            >
              {t("ceremony.retro")}
            </button>
          </div>
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("allSprints")}</h2>
          <div className="overflow-hidden rounded-xl border border-[var(--flux-chrome-alpha-08)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--flux-surface-elevated)] text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                <tr>
                  <th className="px-4 py-2">{t("col.name")}</th>
                  <th className="px-4 py-2">{t("col.board")}</th>
                  <th className="px-4 py-2">{t("col.status")}</th>
                  <th className="px-4 py-2">{t("col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-[var(--flux-text-muted)]">
                      {t("empty")}
                    </td>
                  </tr>
                ) : (
                  rows.map((s) => (
                    <tr key={s.id} className="border-t border-[var(--flux-chrome-alpha-06)]">
                      <td className="px-4 py-3 font-medium text-[var(--flux-text)]">{s.name}</td>
                      <td className="px-4 py-3 text-[var(--flux-text-muted)]">{s.boardName}</td>
                      <td className="px-4 py-3 text-[var(--flux-text-muted)]">
                        <SprintStatusText status={s.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`${localeRoot}/board/${encodeURIComponent(s.boardId)}`}
                          className="text-xs font-semibold text-[var(--flux-primary-light)] hover:underline"
                        >
                          {t("openBoard")}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
