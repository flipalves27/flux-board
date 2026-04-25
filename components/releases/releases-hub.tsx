"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiJson, ApiError, getApiHeaders } from "@/lib/api-client";
import type { BoardMethodology } from "@/lib/board-methodology";
import type { ReleaseData, SprintData } from "@/lib/schemas";
import type { ReleaseWithBoardName } from "@/lib/releases-org-overview";
import { FeatureGateNotice } from "@/components/billing/feature-gate-notice";
import { ReleaseFormDrawer } from "@/components/releases/release-form-drawer";
import { ReleaseStatusPill } from "@/components/releases/release-status-pill";
import { FluxEmptyState } from "@/components/ui/flux-empty-state";

type HubSegment = "upcoming" | "shipped" | "archived";

const UPCOMING: ReadonlySet<ReleaseData["status"]> = new Set([
  "draft",
  "planned",
  "in_review",
  "staging",
]);

type Props = {
  getHeaders: () => Record<string, string>;
};

function segmentOf(r: ReleaseData): HubSegment {
  if (r.archivedAt) return "archived";
  if (r.status === "released" || r.status === "rolled_back") return "shipped";
  if (UPCOMING.has(r.status)) return "upcoming";
  // fallback: e.g. unexpected status — show as upcoming
  return "upcoming";
}

function titleForCard(cardId: string, changelog: ReleaseData["changelog"]): string {
  const hit = (changelog ?? []).find((c) => c.cardId && c.cardId === cardId);
  if (hit?.title) return hit.title;
  if (cardId.length > 10) return `…${cardId.slice(-8)}`;
  return cardId;
}

function sortReleases(
  list: ReleaseWithBoardName[],
  order: "updated" | "version" | "releaseDate"
): void {
  list.sort((a, b) => {
    if (order === "version") {
      return b.version.localeCompare(a.version, undefined, { numeric: true });
    }
    if (order === "releaseDate") {
      const ad = a.releasedAt || a.plannedAt || a.updatedAt;
      const bd = b.releasedAt || b.plannedAt || b.updatedAt;
      return new Date(bd).getTime() - new Date(ad).getTime();
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function ReleasesHub({ getHeaders }: Props) {
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("releases.hub");
  const tAct = useTranslations("releases.actions");
  const tStatus = useTranslations("releases.statuses");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReleaseWithBoardName[]>([]);
  const [boardSummaries, setBoardSummaries] = useState<
    Array<{ id: string; name: string; boardMethodology?: BoardMethodology }>
  >([]);

  const [segment, setSegment] = useState<HubSegment>("upcoming");
  const [search, setSearch] = useState("");
  const [filterBoardId, setFilterBoardId] = useState<string>("");
  const [sort, setSort] = useState<"updated" | "version" | "releaseDate">("updated");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ReleaseData | null>(null);
  const [drawerBoardId, setDrawerBoardId] = useState<string | null>(null);
  const [drawerSprints, setDrawerSprints] = useState<SprintData[]>([]);
  const [sprintsLoading, setSprintsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReleaseWithBoardName | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{
        releases: ReleaseWithBoardName[];
        boards?: Array<{ id: string; name: string; boardMethodology?: BoardMethodology }>;
      }>("/api/releases", getHeaders());
      setRows(Array.isArray(data?.releases) ? data.releases : []);
      setBoardSummaries(Array.isArray(data?.boards) ? data.boards : []);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 402 || e.status === 403)) setError("upgrade");
      else if (e instanceof ApiError && e.status === 401) setError("auth");
      else setError("load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!drawerOpen || !drawerBoardId) {
      setDrawerSprints([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSprintsLoading(true);
      try {
        const data = await apiGet<{ sprints: SprintData[] }>(
          `/api/boards/${encodeURIComponent(drawerBoardId)}/sprints`,
          getHeaders()
        );
        if (!cancelled) setDrawerSprints(data.sprints ?? []);
      } catch {
        if (!cancelled) setDrawerSprints([]);
      } finally {
        if (!cancelled) setSprintsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, drawerBoardId, getHeaders]);

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

  const bySegment = useMemo(() => {
    return rows.filter((r) => segmentOf(r) === segment);
  }, [rows, segment]);

  const filteredRows = useMemo(() => {
    let list = bySegment;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.version.toLowerCase().includes(q) ||
          r.boardName.toLowerCase().includes(q)
      );
    }
    if (filterBoardId) list = list.filter((r) => r.boardId === filterBoardId);
    const copy = [...list];
    sortReleases(copy, sort);
    return copy;
  }, [bySegment, search, filterBoardId, sort]);

  const kpi = useMemo(() => {
    const nUp = rows.filter((r) => segmentOf(r) === "upcoming").length;
    const nShip = rows.filter((r) => segmentOf(r) === "shipped").length;
    const nArch = rows.filter((r) => segmentOf(r) === "archived").length;
    const cards = filteredRows.reduce((acc, r) => acc + (r.cardIds?.length ?? 0), 0);
    const risks = filteredRows.reduce((acc, r) => acc + (r.risks?.length ?? 0), 0);
    return { nUp, nShip, nArch, cards, risks };
  }, [rows, filteredRows]);

  const openEdit = (r: ReleaseWithBoardName) => {
    setEditing(r);
    setDrawerBoardId(r.boardId);
    setDrawerOpen(true);
  };

  const tryCreate = () => {
    const bid = filterBoardId || boardsUnique[0]?.id;
    if (!bid) return;
    setEditing(null);
    setDrawerBoardId(bid);
    setDrawerOpen(true);
  };

  const patchRelease = async (r: ReleaseWithBoardName, body: Record<string, unknown>) => {
    await apiJson<{ release: ReleaseData }>(
      `/api/boards/${encodeURIComponent(r.boardId)}/releases/${encodeURIComponent(r.id)}`,
      { method: "PATCH", body: JSON.stringify(body), headers: getApiHeaders(getHeaders()) }
    );
    await load();
  };

  const onArchive = async (r: ReleaseWithBoardName) => {
    try {
      await patchRelease(r, { archivedAt: new Date().toISOString() });
    } catch {
      /* quiet */
    }
  };

  const onUnarchive = async (r: ReleaseWithBoardName) => {
    try {
      await patchRelease(r, { archivedAt: null });
    } catch {
      /* quiet */
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    const r = deleteTarget;
    setDeleteTarget(null);
    try {
      await apiDelete(
        `/api/boards/${encodeURIComponent(r.boardId)}/releases/${encodeURIComponent(r.id)}`,
        getApiHeaders(getHeaders())
      );
      setRows((prev) => prev.filter((x) => x.id !== r.id));
    } catch {
      /* quiet */
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--flux-text-muted)]">
            {t("pretitle")}
          </p>
          <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[var(--flux-text-muted)]">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(filterBoardId || boardsUnique.length === 1) && (
            <button
              type="button"
              onClick={tryCreate}
              className="rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
            >
              + {t("newRelease")}
            </button>
          )}
        </div>
      </header>

      {error === "upgrade" ? (
        <FeatureGateNotice
          title={t("upgradeTitle")}
          description={t("upgradeDescription")}
          ctaLabel={t("upgradeCta")}
          ctaHref={`${localeRoot}/billing`}
        />
      ) : error ? (
        <div className="rounded-[var(--flux-rad-md)] border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-08)] px-4 py-3 text-sm">
          {error === "load" ? t("error.load") : error === "auth" ? t("error.auth") : t("error.unknown")}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label={t("kpi.upcoming")} value={String(kpi.nUp)} />
        <Kpi label={t("kpi.shipped")} value={String(kpi.nShip)} />
        <Kpi label={t("kpi.archived")} value={String(kpi.nArch)} />
        <Kpi label={t("kpi.cards")} value={String(kpi.cards)} caption={t("kpi.cardsHint")} />
        <Kpi label={t("kpi.risks")} value={String(kpi.risks)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentTab id="upcoming" current={segment} onSelect={setSegment} label={t("segments.upcoming")} />
        <SegmentTab id="shipped" current={segment} onSelect={setSegment} label={t("segments.shipped")} />
        <SegmentTab id="archived" current={segment} onSelect={setSegment} label={t("segments.archived")} />
        <span aria-hidden className="mx-1 h-5 w-px self-center bg-[var(--flux-chrome-alpha-12)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-[12rem] flex-1 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-2.5 py-1.5 text-xs"
        />
        <select
          value={filterBoardId}
          onChange={(e) => setFilterBoardId(e.target.value)}
          className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-2.5 py-1.5 text-xs"
        >
          <option value="">{t("allBoards")}</option>
          {boardsUnique.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-2.5 py-1.5 text-xs"
        >
          <option value="updated">{t("sort.updated")}</option>
          <option value="version">{t("sort.version")}</option>
          <option value="releaseDate">{t("sort.releaseDate")}</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p>
      ) : filteredRows.length === 0 && !error ? (
        <FluxEmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--flux-rad-md)] border border-[var(--flux-chrome-alpha-12)]">
          <table className="w-full min-w-[800px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                <th className="px-3 py-2">{t("table.board")}</th>
                <th className="px-3 py-2">{t("table.version")}</th>
                <th className="px-3 py-2">{t("table.status")}</th>
                <th className="px-3 py-2">{t("table.dates")}</th>
                <th className="px-3 py-2">{t("table.sprints")}</th>
                <th className="px-3 py-2 text-right">{t("table.cards")}</th>
                <th className="px-3 py-2 text-right">{t("table.health")}</th>
                <th className="px-3 py-2 text-right">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--flux-chrome-alpha-08)] last:border-0">
                  <td className="px-3 py-2.5">
                    <Link
                      className="font-medium text-[var(--flux-primary-light)] hover:underline"
                      href={`${localeRoot}/board/${encodeURIComponent(r.boardId)}`}
                    >
                      {r.boardName}
                    </Link>
                    <p className="line-clamp-1 text-xs text-[var(--flux-text)]">{r.name}</p>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">v{r.version}</td>
                  <td className="px-3 py-2.5">
                    <ReleaseStatusPill status={r.status} label={tStatus(r.status)} />
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-[var(--flux-text-muted)]">
                    {r.releasedAt ? <span>↑ {new Date(r.releasedAt).toLocaleDateString()}</span> : null}{" "}
                    {r.plannedAt ? <span>· {t("table.planned")} {new Date(r.plannedAt).toLocaleDateString()}</span> : null}
                    {!r.releasedAt && !r.plannedAt ? "—" : null}
                  </td>
                  <td className="max-w-[12rem] px-3 py-2.5 text-[11px] text-[var(--flux-text-muted)] line-clamp-2">
                    {(r.sprintNames ?? []).filter((x) => x && x !== "—").join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {r.cardIds.length}
                    <ul className="mt-1 space-y-0.5 text-left font-sans text-[10px] font-normal">
                      {r.cardIds.slice(0, 4).map((cid) => {
                        const label = titleForCard(cid, r.changelog);
                        return (
                          <li key={cid}>
                            <Link
                              className="text-[var(--flux-primary)] hover:underline"
                              href={`${localeRoot}/board/${encodeURIComponent(r.boardId)}?card=${encodeURIComponent(cid)}`}
                            >
                              {label}
                            </Link>
                          </li>
                        );
                      })}
                      {r.cardIds.length > 4 ? <li>+{r.cardIds.length - 4}</li> : null}
                    </ul>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs">{r.healthScore ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void openEdit(r)}
                          className="rounded border border-[var(--flux-chrome-alpha-12)] px-2 py-0.5 text-[10px] font-semibold"
                        >
                          {tAct("edit")}
                        </button>
                        {r.archivedAt ? (
                          <button
                            type="button"
                            onClick={() => void onUnarchive(r)}
                            className="rounded border border-[var(--flux-chrome-alpha-12)] px-2 py-0.5 text-[10px] font-semibold"
                          >
                            {tAct("unarchive")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void onArchive(r)}
                            className="rounded border border-[var(--flux-chrome-alpha-12)] px-2 py-0.5 text-[10px] font-semibold"
                          >
                            {tAct("archive")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          className="rounded border border-[var(--flux-danger-alpha-22)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-danger)]"
                        >
                          {tAct("delete")}
                        </button>
                      </div>
                      <Link
                        className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary)]"
                        href={`${localeRoot}/board/${encodeURIComponent(r.boardId)}/releases`}
                      >
                        {t("openBoardReleases")}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawerBoardId ? (
        <ReleaseFormDrawer
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setEditing(null);
            setDrawerBoardId(null);
          }}
          boardId={drawerBoardId}
          release={editing}
          sprints={sprintsLoading && drawerSprints.length === 0 && editing ? [] : drawerSprints}
          getHeaders={getHeaders}
          onSaved={() => {
            void load();
          }}
        />
      ) : null}
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center bg-[var(--flux-backdrop-scrim-strong)]"
          role="dialog"
          aria-modal
          aria-labelledby="rel-del-title"
        >
          <div className="min-w-[min(100%,20rem)] rounded-[var(--flux-rad-md)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-5 shadow-xl">
            <p id="rel-del-title" className="mb-3 text-center text-sm font-medium text-[var(--flux-text)]">
              {tAct("deleteConfirm", { name: deleteTarget.name })}
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                {tAct("cancel")}
              </button>
              <button type="button" className="btn-danger-solid" onClick={() => void onConfirmDelete()}>
                {tAct("confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="rounded-[var(--flux-rad-md)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-[var(--flux-text)]">{value}</p>
      {caption ? <p className="text-[10px] text-[var(--flux-text-muted)]">{caption}</p> : null}
    </div>
  );
}

function SegmentTab({
  id,
  current,
  onSelect,
  label,
}: {
  id: HubSegment;
  current: HubSegment;
  onSelect: (s: HubSegment) => void;
  label: string;
}) {
  const active = current === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? "bg-[var(--flux-primary)] text-white"
          : "border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)]"
      }`}
    >
      {label}
    </button>
  );
}
