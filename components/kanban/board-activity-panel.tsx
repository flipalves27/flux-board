"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCopilotStore } from "@/stores/copilot-store";
import { useBoardActivityStore } from "@/stores/board-activity-store";
import { useBoardExecutionInsightsStore } from "@/stores/board-execution-insights-store";
import { BOARD_ACTIVITY_ACTIONS, type BoardActivityAction } from "@/lib/board-activity-types";

export type BoardActivityEntry = {
  id: string;
  userId: string;
  userName: string;
  action: BoardActivityAction;
  target: string;
  details: Record<string, unknown> | null;
  timestamp: string;
};

type ActivityApiResponse = {
  entries: BoardActivityEntry[];
  retentionDays: number | null;
  mongoConfigured: boolean;
  boardName?: string;
};

type BoardActivityPanelProps = {
  boardId: string;
  getHeaders: () => Record<string, string>;
};

function initials(name: string): string {
  const s = String(name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return s.slice(0, 2).toUpperCase();
}

function formatWhen(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export function BoardActivityPanel({ boardId, getHeaders }: BoardActivityPanelProps) {
  const t = useTranslations("kanban.activity");
  const locale = useLocale();
  const copilotOpen = useCopilotStore((s) => s.open);
  const setCopilotOpen = useCopilotStore((s) => s.setOpen);
  const open = useBoardActivityStore((s) => s.open);
  const setOpen = useBoardActivityStore((s) => s.setOpen);
  const toggleOpen = useBoardActivityStore((s) => s.toggleOpen);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ActivityApiResponse | null>(null);

  const [filterUserId, setFilterUserId] = useState("");
  const [filterAction, setFilterAction] = useState<BoardActivityAction | "">("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const fetchWithParams = useCallback(
    async (p: URLSearchParams) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/activity?${p.toString()}`, {
          headers: { ...getHeaders() },
        });
        const json = (await res.json().catch(() => ({}))) as ActivityApiResponse & { error?: string };
        if (!res.ok) {
          throw new Error(json.error || "Erro");
        }
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("loadError"));
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [boardId, getHeaders, t]
  );

  const buildParamsFromState = useCallback(() => {
    const p = new URLSearchParams();
    p.set("limit", "500");
    if (filterUserId.trim()) p.set("userId", filterUserId.trim());
    if (filterAction) p.set("action", filterAction);
    if (filterFrom.trim()) {
      const d = new Date(filterFrom);
      if (!Number.isNaN(d.getTime())) p.set("from", d.toISOString());
    }
    if (filterTo.trim()) {
      const d = new Date(filterTo);
      if (!Number.isNaN(d.getTime())) p.set("to", d.toISOString());
    }
    return p;
  }, [filterUserId, filterAction, filterFrom, filterTo]);

  const load = useCallback(() => fetchWithParams(buildParamsFromState()), [buildParamsFromState, fetchWithParams]);

  const clearFiltersAndLoad = useCallback(() => {
    setFilterUserId("");
    setFilterAction("");
    setFilterFrom("");
    setFilterTo("");
    const p = new URLSearchParams();
    p.set("limit", "500");
    void fetchWithParams(p);
  }, [fetchWithParams]);

  useEffect(() => {
    if (!open) return;
    void fetchWithParams(buildParamsFromState());
    // Intentional: only refetch when the panel opens; filter changes use "Aplicar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const userOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of data?.entries ?? []) {
      if (!m.has(e.userId)) m.set(e.userId, e.userName);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data?.entries]);

  const onOpenToggle = () => {
    if (!open) {
      setCopilotOpen(false);
      useBoardExecutionInsightsStore.getState().setOpen(false);
    }
    toggleOpen();
  };

  const fabRight = copilotOpen ? "right-[calc(min(440px,92vw)+16px)]" : "right-4";

  return (
    <>
      <button
        type="button"
        className={`max-md:hidden fixed z-[var(--flux-z-fab-activity)] transition-all duration-200 active:scale-[0.98] ${fabRight} top-[168px]`}
        onClick={onOpenToggle}
        aria-expanded={open}
        aria-label={open ? t("fabClose") : t("fabOpen")}
      >
        <span className="relative inline-flex items-center gap-2 rounded-l-xl rounded-r-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-mid)] px-2.5 py-2 text-[var(--flux-text)] shadow-[var(--flux-shadow-copilot-bubble)] backdrop-blur-md hover:border-[var(--flux-primary)]">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </span>
          <span className="text-[11px] font-semibold whitespace-nowrap">{open ? t("fabClose") : t("fabOpen")}</span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[var(--flux-z-fab-panel-high)] pointer-events-none">
          <div className="absolute right-4 top-[92px] bottom-4 w-[min(440px,92vw)] bg-[var(--flux-surface-card)] border border-[var(--flux-border-subtle)] rounded-[var(--flux-rad)] shadow-[0_18px_60px_var(--flux-black-alpha-45)] pointer-events-auto flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--flux-chrome-alpha-08)] flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-bold font-display text-[var(--flux-primary-light)] truncate">{t("title")}</div>
                <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">{t("subtitle")}</div>
              </div>
              <button type="button" className="btn-secondary px-3 py-1.5 shrink-0" onClick={() => setOpen(false)}>
                {t("fabClose")}
              </button>
            </div>

            <div className="px-4 py-3 border-b border-[var(--flux-chrome-alpha-08)] space-y-2 shrink-0 bg-[var(--flux-black-alpha-08)]">
              {data?.mongoConfigured === false ? (
                <p className="text-[11px] text-[var(--flux-text-muted)]">{t("noMongo")}</p>
              ) : data?.retentionDays != null ? (
                <p className="text-[11px] text-[var(--flux-text-muted)]">
                  {t("retentionHint", { days: data.retentionDays })} {t("retentionPro")}
                </p>
              ) : (
                <p className="text-[11px] text-[var(--flux-text-muted)]">{t("retentionPro")}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                  {t("filterUser")}
                  <select
                    className="mt-1 w-full rounded-[8px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-1.5 text-xs text-[var(--flux-text)]"
                    value={filterUserId}
                    onChange={(e) => setFilterUserId(e.target.value)}
                  >
                    <option value="">{t("filterUserAll")}</option>
                    {userOptions.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                  {t("filterAction")}
                  <select
                    className="mt-1 w-full rounded-[8px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-1.5 text-xs text-[var(--flux-text)]"
                    value={filterAction}
                    onChange={(e) => setFilterAction((e.target.value || "") as BoardActivityAction | "")}
                  >
                    <option value="">{t("filterActionAll")}</option>
                    {BOARD_ACTIVITY_ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {t(`actions.${a.replace(/\./g, "_")}` as "actions.card_created")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                  {t("filterFrom")}
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-[8px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-1.5 text-xs text-[var(--flux-text)]"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                  {t("filterTo")}
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-[8px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-1.5 text-xs text-[var(--flux-text)]"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary text-xs py-1.5 px-3" onClick={() => void load()} disabled={loading}>
                  {t("applyFilters")}
                </button>
                <button type="button" className="btn-secondary text-xs py-1.5 px-3" onClick={() => clearFiltersAndLoad()} disabled={loading}>
                  {t("clearFilters")}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-4 py-3">
              {loading && <p className="text-xs text-[var(--flux-text-muted)]">…</p>}
              {error && <p className="text-xs text-[var(--flux-danger-bright)]">{error}</p>}
              {!loading && !error && (data?.entries?.length ?? 0) === 0 && (
                <p className="text-xs text-[var(--flux-text-muted)]">{t("empty")}</p>
              )}
              <ul className="space-y-3">
                {(data?.entries ?? []).map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <div
                      className="shrink-0 h-9 w-9 rounded-full border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-primary-alpha-12)] flex items-center justify-center text-[11px] font-bold text-[var(--flux-primary-light)]"
                      aria-hidden
                    >
                      {initials(e.userName)}
                    </div>
                    <div className="min-w-0 flex-1 border-l-2 border-[var(--flux-chrome-alpha-10)] pl-3">
                      <div className="text-xs text-[var(--flux-text)]">
                        <span className="font-semibold">{e.userName}</span>{" "}
                        <span className="text-[var(--flux-text-muted)]">{t(`actions.${e.action.replace(/\./g, "_")}` as "actions.card_created")}</span>
                      </div>
                      <div className="text-[11px] text-[var(--flux-text)] mt-0.5 break-words">{e.target}</div>
                      <div className="text-[10px] text-[var(--flux-text-muted)] mt-1">{formatWhen(e.timestamp, locale)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
