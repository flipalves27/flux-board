"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiGet, ApiError, getApiHeaders } from "@/lib/api-client";
import type { BoardSprintHistoryRow } from "@/lib/sprint-board-history";
import { Header } from "@/components/header";
import { FluxEmptyState } from "@/components/ui/flux-empty-state";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
};

type HistoryResponse = {
  boardId: string;
  boardName: string;
  sprints: BoardSprintHistoryRow[];
};

function escapeCsvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function BoardSprintHistoryView({ boardId, getHeaders }: Props) {
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("sprints.history");
  const ts = useTranslations("sprints.status");
  const tSprints = useTranslations("sprints");
  const tForm = useTranslations("sprints.form");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<HistoryResponse | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [sort, setSort] = useState<"endDate" | "name" | "velocity">("endDate");
  const [search, setSearch] = useState("");
  const [readMode, setReadMode] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = filterStatus && filterStatus !== "all" ? `?status=${encodeURIComponent(filterStatus)}` : "";
      const data = await apiGet<HistoryResponse>(
        `/api/boards/${encodeURIComponent(boardId)}/sprints/history${q}`,
        getHeaders()
      );
      setPayload(data);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 402 || e.status === 403)) {
        setError("upgrade");
      } else {
        setError("load");
      }
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [boardId, filterStatus, getHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSprint = useMemo(
    () => payload?.sprints.find((s) => s.status === "active") ?? null,
    [payload?.sprints]
  );

  const closedSprints = useMemo(
    () => (payload?.sprints ?? []).filter((s) => s.status === "closed"),
    [payload?.sprints]
  );

  const lastClosed = useMemo(() => {
    const withEnd = closedSprints
      .filter((s) => s.endDate)
      .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)));
    return withEnd[0]?.endDate ?? null;
  }, [closedSprints]);

  const filtered = useMemo(() => {
    let list = [...(payload?.sprints ?? [])];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        if (s.name.toLowerCase().includes(q) || s.goal.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) {
          return true;
        }
        return (s.sprintTags ?? []).some((tag) => tag.toLowerCase().includes(q));
      });
    }
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "velocity") {
        const va = a.velocity ?? -1;
        const vb = b.velocity ?? -1;
        return vb - va;
      }
      const ta = a.endDate ? new Date(a.endDate).getTime() : 0;
      const tb = b.endDate ? new Date(b.endDate).getTime() : 0;
      return tb - ta;
    });
    return list;
  }, [payload?.sprints, search, sort]);

  const chartData = useMemo(() => {
    const rows = [...closedSprints]
      .filter((s) => s.endDate)
      .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
    return rows.map((s) => ({
      label: (s.endDate ?? "").slice(0, 10),
      name: s.name.slice(0, 18),
      velocity: s.velocity ?? 0,
    }));
  }, [closedSprints]);

  const exportJson = () => {
    if (!payload) return;
    const body = {
      boardId: payload.boardId,
      boardName: payload.boardName,
      exportedAt: new Date().toISOString(),
      sprints: filtered.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        goal: s.goal,
        startDate: s.startDate,
        endDate: s.endDate,
        velocity: s.velocity,
        scopeCount: s.scopeCount,
        doneCount: s.doneCount,
        carryoverCount: s.carryoverCount,
        hasScopeSnapshot: s.hasScopeSnapshot,
        sprintTags: s.sprintTags,
        programIncrementId: s.programIncrementId,
      })),
    };
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sprint-history-${payload.boardId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = async () => {
    if (!payload) return;
    const res = await apiFetch(
      `/api/boards/${encodeURIComponent(boardId)}/sprints/history?includeCardRows=1`,
      { headers: getApiHeaders(getHeaders()) }
    );
    if (!res.ok) return;
    const full = (await res.json()) as HistoryResponse;
    const lines = ["sprintId,sprintName,cardId,title,bucket,bucketLabel,done"];
    for (const s of full.sprints) {
      if (s.cardRows?.length) {
        for (const r of s.cardRows) {
          lines.push(
            [
              escapeCsvCell(s.id),
              escapeCsvCell(s.name),
              escapeCsvCell(r.cardId),
              escapeCsvCell(r.title),
              escapeCsvCell(r.bucket),
              escapeCsvCell(r.bucketLabel),
              r.done ? "1" : "0",
            ].join(",")
          );
        }
      } else {
        lines.push([escapeCsvCell(s.id), escapeCsvCell(s.name), "", "", "", "", ""].join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sprint-history-${payload.boardId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sprintById = useMemo(() => new Map((payload?.sprints ?? []).map((s) => [s.id, s])), [payload?.sprints]);

  const compareLeft = compareA ? sprintById.get(compareA) : undefined;
  const compareRight = compareB ? sprintById.get(compareB) : undefined;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--flux-bg)]">
        <Header />
        <div className="mx-auto max-w-5xl px-4 py-16 text-sm text-[var(--flux-text-muted)]">{t("loading")}</div>
      </div>
    );
  }

  if (error === "upgrade") {
    return (
      <div className="min-h-screen bg-[var(--flux-bg)]">
        <Header />
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-[var(--flux-text-muted)]">
          <p>{t("loadError")}</p>
          <Link href={`${localeRoot}/billing`} className="mt-4 inline-block text-[var(--flux-primary-light)] underline">
            {tSprints("upgradeCta")}
          </Link>
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen bg-[var(--flux-bg)]">
        <Header />
        <div className="mx-auto max-w-5xl px-4 py-16 space-y-4">
          <p className="text-sm text-[var(--flux-warning)]">{t("loadError")}</p>
          <button type="button" className="btn-primary px-4 py-2 text-sm font-semibold" onClick={() => void load()}>
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-[var(--flux-bg)] print:bg-white ${readMode ? "print-friendly-sprint-history" : ""}`}
    >
      <Header />
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8 print:max-w-none print:px-6">
        <div className="flex flex-col gap-4 border-b border-[var(--flux-chrome-alpha-08)] pb-6 print:border-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">{t("pageTitle")}</h1>
              <p className="mt-1 text-sm text-[var(--flux-text-muted)]">
                {payload.boardName} · {t("subtitle")}
              </p>
              <p className="mt-2 text-xs text-[var(--flux-text-muted)]">
                {t("closedCount", { count: closedSprints.length })}
                {lastClosed ? ` · ${t("lastClosed")}: ${lastClosed}` : ` · ${t("noneClosed")}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Link
                href={`${localeRoot}/board/${encodeURIComponent(boardId)}`}
                className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
              >
                {t("backBoard")}
              </Link>
              <Link
                href={`${localeRoot}/sprints`}
                className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
              >
                {t("openHub")}
              </Link>
              {activeSprint ? (
                <Link
                  href={`${localeRoot}/sprints/${encodeURIComponent(boardId)}/${encodeURIComponent(activeSprint.id)}`}
                  className="btn-primary px-3 py-2 text-xs font-semibold"
                >
                  {t("openActive")}
                </Link>
              ) : (
                <Link
                  href={`${localeRoot}/board/${encodeURIComponent(boardId)}?sprintPanel=1`}
                  className="btn-primary px-3 py-2 text-xs font-semibold"
                >
                  {t("createSprint")}
                </Link>
              )}
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] p-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("chartTitle")}</h2>
          </div>
          {chartData.length === 0 ? (
            <p className="text-sm text-[var(--flux-text-muted)] py-6">{t("chartEmpty")}</p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--flux-text-muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--flux-text-muted)" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--flux-surface-card)",
                      border: "1px solid var(--flux-chrome-alpha-12)",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => [v, t("compareVelocity")]}
                    labelFormatter={(_, p) => (p?.[0]?.payload?.name as string) ?? ""}
                  />
                  <Line
                    type="monotone"
                    dataKey="velocity"
                    stroke="var(--flux-primary-light)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--flux-primary)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-3 rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] p-4 sm:flex-row sm:flex-wrap sm:items-end print:hidden">
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
            {t("filterStatus")}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-2 text-sm"
            >
              <option value="">{t("filterAll")}</option>
              <option value="planning">{ts("planning")}</option>
              <option value="active">{ts("active")}</option>
              <option value="review">{ts("review")}</option>
              <option value="closed">{ts("closed")}</option>
            </select>
          </label>
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
            {t("sortLabel")}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-2 text-sm"
            >
              <option value="endDate">{t("sortEndDate")}</option>
              <option value="name">{t("sortName")}</option>
              <option value="velocity">{t("sortVelocity")}</option>
            </select>
          </label>
          <label className="flex min-w-[200px] flex-[2] flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
            {t("searchPlaceholder")}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold" onClick={exportJson}>
              {t("exportJson")}
            </button>
            <button type="button" className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold" onClick={() => void exportCsv()}>
              {t("exportCsv")}
            </button>
            <button type="button" className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold" onClick={() => setCompareOpen(true)}>
              {t("compareOpen")}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold"
              onClick={() => setReadMode((v) => !v)}
            >
              {t("printFriendly")}
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <FluxEmptyState
            title={t("pageTitle")}
            description={(payload.sprints ?? []).length === 0 ? tSprints("empty") : tSprints("emptyFiltered")}
          />
        ) : (
          <ul className="space-y-3 print:space-y-4">
            {filtered.map((s) => (
              <li
                key={s.id}
                className="rounded-2xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-semibold text-[var(--flux-text)]">{s.name}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{ts(s.status)}</span>
                    {s.hasScopeSnapshot ? (
                      <span className="rounded-full bg-[var(--flux-primary-alpha-12)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-primary-light)]">
                        {t("snapshotBadge")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-[var(--flux-chrome-alpha-08)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-text-muted)]">
                        {t("legacyBadge")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--flux-text-muted)] mt-1">
                    {s.startDate && s.endDate ? `${s.startDate} → ${s.endDate}` : "—"} · {t("compareScope")}: {s.scopeCount} · {t("compareDone")}:{" "}
                    {s.doneCount} · {t("compareCarryover")}: {s.carryoverCount}
                    {s.velocity != null ? ` · ${t("compareVelocity")}: ${s.velocity}` : ""}
                  </p>
                  {s.goal ? <p className="text-xs text-[var(--flux-text)] mt-1 line-clamp-2">{s.goal}</p> : null}
                </div>
                <Link
                  href={`${localeRoot}/sprints/${encodeURIComponent(boardId)}/${encodeURIComponent(s.id)}`}
                  className="shrink-0 rounded-lg bg-[var(--flux-primary-alpha-22)] px-3 py-2 text-xs font-semibold text-[var(--flux-primary-light)] print:hidden"
                >
                  {t("openDetail")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {compareOpen ? (
        <div
          className="fixed inset-0 z-[var(--flux-z-modal)] flex items-center justify-center bg-[var(--flux-backdrop-scrim)] p-4"
          role="dialog"
          aria-modal
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] p-5 shadow-[var(--flux-shadow-modal-depth)]">
            <h3 className="font-display text-lg font-bold text-[var(--flux-text)]">{t("compareTitle")}</h3>
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
                {t("comparePickA")}
                <select
                  value={compareA}
                  onChange={(e) => setCompareA(e.target.value)}
                  className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {payload.sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
                {t("comparePickB")}
                <select
                  value={compareB}
                  onChange={(e) => setCompareB(e.target.value)}
                  className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {payload.sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {compareLeft && compareRight ? (
              <table className="mt-4 w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-[var(--flux-text-muted)]">
                    <th className="py-1 pr-2" />
                    <th className="py-1 pr-2 font-semibold">{compareLeft.name}</th>
                    <th className="py-1 font-semibold">{compareRight.name}</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--flux-text)]">
                  <tr>
                    <td className="py-1 text-[var(--flux-text-muted)]">{t("compareScope")}</td>
                    <td>{compareLeft.scopeCount}</td>
                    <td>{compareRight.scopeCount}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-[var(--flux-text-muted)]">{t("compareDone")}</td>
                    <td>{compareLeft.doneCount}</td>
                    <td>{compareRight.doneCount}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-[var(--flux-text-muted)]">{t("compareCarryover")}</td>
                    <td>{compareLeft.carryoverCount}</td>
                    <td>{compareRight.carryoverCount}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-[var(--flux-text-muted)]">{t("compareVelocity")}</td>
                    <td>{compareLeft.velocity ?? "—"}</td>
                    <td>{compareRight.velocity ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="py-1 align-top text-[var(--flux-text-muted)]">{t("compareGoal")}</td>
                    <td className="align-top max-w-[140px]">{compareLeft.goal || "—"}</td>
                    <td className="align-top max-w-[140px]">{compareRight.goal || "—"}</td>
                  </tr>
                  <tr>
                    <td className="py-1 align-top text-[var(--flux-text-muted)]">{t("compareTags")}</td>
                    <td className="align-top">{(compareLeft.sprintTags ?? []).join(", ") || "—"}</td>
                    <td className="align-top">{(compareRight.sprintTags ?? []).join(", ") || "—"}</td>
                  </tr>
                </tbody>
              </table>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold" onClick={() => setCompareOpen(false)}>
                {tForm("close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @media print {
          .print-friendly-sprint-history header,
          .print-friendly-sprint-history .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
