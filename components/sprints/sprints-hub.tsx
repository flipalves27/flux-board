"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiGet, ApiError, getApiHeaders } from "@/lib/api-client";
import type { SprintData } from "@/lib/schemas";
import type { SprintWithBoardName } from "@/lib/sprints-org-overview";
import { useCeremonyStore } from "@/stores/ceremony-store";
import { KanbanCadencePanel } from "@/components/ceremonies/kanban-cadence-panel";
import { FeatureGateNotice } from "@/components/billing/feature-gate-notice";
import type { BoardMethodology } from "@/lib/board-methodology";
import { SprintFormDrawer } from "@/components/sprints/sprint-form-drawer";

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
  const [boardSummaries, setBoardSummaries] = useState<Array<{ id: string; name: string; boardMethodology?: BoardMethodology }>>([]);
  const openRetro = useCeremonyStore((s) => s.openRetro);
  const openReview = useCeremonyStore((s) => s.openReview);
  const openPlanning = useCeremonyStore((s) => s.openPlanning);
  const openStandup = useCeremonyStore((s) => s.openStandup);
  const [hubMode, setHubMode] = useState<"scrum" | "kanban">("scrum");
  const [cadenceBoardId, setCadenceBoardId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterBoardId, setFilterBoardId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [sort, setSort] = useState<"updated" | "name">("updated");
  const [createOpen, setCreateOpen] = useState(false);

  const boardsUnique = useMemo(() => {
    if (boardSummaries.length > 0) return boardSummaries;
    const m = new Map<string, { id: string; name: string; boardMethodology?: BoardMethodology }>();
    for (const r of rows) {
      if (!m.has(r.boardId)) {
        m.set(r.boardId, { id: r.boardId, name: r.boardName, boardMethodology: r.boardMethodology });
      }
    }
    return [...m.values()];
  }, [boardSummaries, rows]);

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
        boards?: Array<{ id: string; name: string; boardMethodology?: BoardMethodology }>;
      }>("/api/sprints", getHeaders());
      setRows(Array.isArray(data?.sprints) ? data.sprints : []);
      setBoardSummaries(Array.isArray(data?.boards) ? data.boards : []);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 402 || e.status === 403)) {
        setError(t("upgradeRequired"));
      } else if (e instanceof ApiError && e.status === 401) {
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

  const filteredRows = useMemo(() => {
    let list = [...rows];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || s.boardName.toLowerCase().includes(q));
    if (filterBoardId) list = list.filter((s) => s.boardId === filterBoardId);
    if (filterStatus) list = list.filter((s) => s.status === filterStatus);
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return list;
  }, [rows, search, filterBoardId, filterStatus, sort]);

  const activeList = useMemo(() => rows.filter((s) => s.status === "active"), [rows]);
  const primaryActive = activeList[0] ?? null;

  const duplicateSprint = async (s: SprintWithBoardName) => {
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(s.boardId)}/sprints/${encodeURIComponent(s.id)}`, {
        headers: { ...getApiHeaders(getHeaders()) },
      });
      if (!res.ok) throw new Error("fetch");
      const data = (await res.json()) as { sprint?: SprintData };
      const src = data.sprint;
      if (!src) throw new Error("no sprint");
      const createRes = await apiFetch(`/api/boards/${encodeURIComponent(s.boardId)}/sprints`, {
        method: "POST",
        headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${src.name} (${t("duplicateSuffix")})`,
          goal: src.goal,
          startDate: src.startDate,
          endDate: src.endDate,
          cardIds: [],
          cadenceType: src.cadenceType,
          reviewCadenceDays: src.reviewCadenceDays,
          wipPolicyNote: src.wipPolicyNote,
          plannedCapacity: src.plannedCapacity,
          commitmentNote: src.commitmentNote,
          programIncrementId: src.programIncrementId,
          sprintTags: src.sprintTags,
          customFields: src.customFields,
        }),
      });
      if (!createRes.ok) throw new Error("create");
      await load();
    } catch {
      /* toast optional */
    }
  };

  const deleteSprint = async (s: SprintWithBoardName) => {
    if (!window.confirm(t("confirmDelete"))) return;
    const res = await apiFetch(`/api/boards/${encodeURIComponent(s.boardId)}/sprints/${encodeURIComponent(s.id)}`, {
      method: "DELETE",
      headers: getApiHeaders(getHeaders()),
    });
    if (res.ok) await load();
  };

  const defaultBoardForCreate = boardsUnique[0]?.id ?? "";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">{t("title")}</h1>
            <p className="mt-1 text-sm text-[var(--flux-text-muted)]">{t("subtitle")}</p>
          </div>
          <button type="button" className="btn-primary px-4 py-2 text-sm font-semibold shrink-0" onClick={() => setCreateOpen(true)}>
            {t("newSprint")}
          </button>
        </div>
        {!loading && !error ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-[var(--flux-text-muted)]">{t("hubFocus")}</span>
            <div className="inline-flex rounded-lg border border-[var(--flux-chrome-alpha-12)] p-0.5 bg-[var(--flux-surface-elevated)]">
              <button
                type="button"
                onClick={() => setHubMode("scrum")}
                aria-pressed={hubMode === "scrum"}
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
                aria-pressed={hubMode === "kanban"}
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

      {!loading && !error ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
            {t("filterSearch")}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-2 text-sm"
            />
          </label>
          <label className="flex min-w-[160px] flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
            {t("filterBoard")}
            <select
              value={filterBoardId}
              onChange={(e) => setFilterBoardId(e.target.value)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-2 text-sm"
            >
              <option value="">{t("filterAll")}</option>
              {boardsUnique.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[140px] flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
            {t("filterStatus")}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-2 text-sm"
            >
              <option value="">{t("filterAll")}</option>
              <option value="planning">{t("status.planning")}</option>
              <option value="active">{t("status.active")}</option>
              <option value="review">{t("status.review")}</option>
              <option value="closed">{t("status.closed")}</option>
            </select>
          </label>
          <label className="flex min-w-[140px] flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
            {t("sortLabel")}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "updated" | "name")}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-2 text-sm"
            >
              <option value="updated">{t("sortUpdated")}</option>
              <option value="name">{t("sortName")}</option>
            </select>
          </label>
        </div>
      ) : null}

      {error ? (
        error === t("upgradeRequired") ? (
          <FeatureGateNotice
            title={t("upgradeTitle")}
            description={error}
            ctaLabel={t("upgradeCta")}
            ctaHref={`${localeRoot}/billing`}
          />
        ) : (
          <div className="rounded-xl border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-08)] px-4 py-3 text-sm text-[var(--flux-text)]">
            {error}
          </div>
        )
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
            {primaryActive.startDate && primaryActive.endDate ? ` · ${primaryActive.startDate} → ${primaryActive.endDate}` : null}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href={`${localeRoot}/sprints/${encodeURIComponent(primaryActive.boardId)}/${encodeURIComponent(primaryActive.id)}`}
              className="rounded-lg bg-[var(--flux-primary)] px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
            >
              {t("openDetail")}
            </Link>
            <Link
              href={`${localeRoot}/board/${encodeURIComponent(primaryActive.boardId)}`}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
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
                  <th className="px-4 py-2">{t("col.method")}</th>
                  <th className="px-4 py-2">{t("col.status")}</th>
                  <th className="px-4 py-2">{t("col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[var(--flux-text-muted)]">
                      {rows.length === 0 ? t("empty") : t("emptyFiltered")}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((s) => (
                    <tr key={s.id} className="border-t border-[var(--flux-chrome-alpha-06)]">
                      <td className="px-4 py-3 font-medium text-[var(--flux-text)]">{s.name}</td>
                      <td className="px-4 py-3 text-[var(--flux-text-muted)]">{s.boardName}</td>
                      <td className="px-4 py-3 text-[var(--flux-text-muted)] text-xs">
                        {s.boardMethodology === "kanban" ? "Kanban" : "Scrum"}
                      </td>
                      <td className="px-4 py-3 text-[var(--flux-text-muted)]">
                        <SprintStatusText status={s.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
                          <Link
                            href={`${localeRoot}/sprints/${encodeURIComponent(s.boardId)}/${encodeURIComponent(s.id)}`}
                            className="text-[var(--flux-primary-light)] hover:underline"
                          >
                            {t("openDetail")}
                          </Link>
                          <Link href={`${localeRoot}/board/${encodeURIComponent(s.boardId)}`} className="text-[var(--flux-text-muted)] hover:underline">
                            {t("openBoard")}
                          </Link>
                          <button type="button" className="text-[var(--flux-text-muted)] hover:underline" onClick={() => void duplicateSprint(s)}>
                            {t("duplicate")}
                          </button>
                          <button type="button" className="text-[var(--flux-warning)] hover:underline" onClick={() => void deleteSprint(s)}>
                            {t("delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <SprintFormDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        boardId={defaultBoardForCreate}
        boards={boardsUnique}
        sprint={null}
        getHeaders={getHeaders}
        onSaved={() => void load()}
      />
    </div>
  );
}
