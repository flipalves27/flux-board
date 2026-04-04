"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useBoardStore } from "@/stores/board-store";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { SprintData } from "@/lib/schemas";
import type { CardData } from "@/app/board/[id]/page";
import { isCardProgressDone } from "@/lib/card-progress-utils";

export type SprintBacklogPickerProps = {
  boardId: string;
  sprint: SprintData;
  getHeaders: () => Record<string, string>;
  onSprintUpdated: (s: SprintData) => void;
  /** Layout mais compacto (ex.: modal de planejamento). */
  compact?: boolean;
};

export function SprintBacklogPicker({
  boardId,
  sprint,
  getHeaders,
  onSprintUpdated,
  compact,
}: SprintBacklogPickerProps) {
  const t = useTranslations("sprints.backlog");
  const storeBoardId = useBoardStore((s) => s.boardId);
  const db = useBoardStore((s) => s.db);
  const [query, setQuery] = useState("");
  const [patching, setPatching] = useState(false);

  const editable = sprint.status === "planning" || sprint.status === "active";

  const bucketLabel = useMemo(() => {
    const m = new Map<string, string>();
    if (db?.config?.bucketOrder) {
      for (const b of db.config.bucketOrder) {
        m.set(b.key, b.label);
      }
    }
    return (key: string) => m.get(key) ?? key;
  }, [db?.config?.bucketOrder]);

  const committedCards = useMemo(() => {
    if (!db?.cards || storeBoardId !== boardId) return [];
    const byId = new Map(db.cards.map((c) => [c.id, c]));
    return sprint.cardIds.map((id) => byId.get(id)).filter(Boolean) as CardData[];
  }, [db?.cards, sprint.cardIds, boardId, storeBoardId]);

  const addablePool = useMemo(() => {
    if (!db?.cards || storeBoardId !== boardId) return [];
    const inSprint = new Set(sprint.cardIds);
    const q = query.trim().toLowerCase();
    return db.cards
      .filter((c) => {
        if (inSprint.has(c.id)) return false;
        if (isCardProgressDone(c.progress)) return false;
        if (!q) return true;
        return c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
      })
      .slice(0, compact ? 40 : 80);
  }, [db?.cards, sprint.cardIds, query, boardId, storeBoardId, compact]);

  const patchIds = useCallback(
    async (nextCardIds: string[]) => {
      setPatching(true);
      try {
        const res = await apiFetch(
          `/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprint.id)}`,
          {
            method: "PATCH",
            headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
            body: JSON.stringify({ cardIds: nextCardIds }),
          }
        );
        if (res.ok) {
          const data = (await res.json()) as { sprint: SprintData };
          onSprintUpdated(data.sprint);
        }
      } finally {
        setPatching(false);
      }
    },
    [boardId, sprint.id, getHeaders, onSprintUpdated]
  );

  const boardMismatch = storeBoardId !== boardId || !db;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-1">{t("title")}</h4>
        <p className="text-[11px] text-[var(--flux-text-muted)] leading-snug">{t("hint")}</p>
        {!editable ? <p className="text-xs text-[var(--flux-warning)] mt-2">{t("readOnlyHint")}</p> : null}
        {boardMismatch ? <p className="text-xs text-[var(--flux-text-muted)] mt-2">{t("boardMismatch")}</p> : null}
      </div>

      <div>
        <p className="text-[11px] font-semibold text-[var(--flux-text-muted)] mb-2">
          {t("committed")} ({committedCards.length})
        </p>
        {committedCards.length === 0 ? (
          <p className="text-xs text-[var(--flux-text-muted)] rounded-lg border border-dashed border-[var(--flux-chrome-alpha-10)] px-3 py-3">{t("emptyCommitted")}</p>
        ) : (
          <ul className={`space-y-1.5 ${compact ? "max-h-[min(200px,40vh)]" : "max-h-[min(280px,45vh)]"} overflow-y-auto scrollbar-kanban`}>
            {committedCards.map((c) => {
              const done = sprint.doneCardIds.includes(c.id);
              return (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--flux-text)] truncate">{c.title}</p>
                    <p className="text-[10px] text-[var(--flux-text-muted)] truncate">
                      {bucketLabel(c.bucket)} · {c.id}
                      {done ? ` · ${t("doneInSprint")}` : ""}
                    </p>
                  </div>
                  {editable ? (
                    <button
                      type="button"
                      disabled={patching}
                      onClick={() => void patchIds(sprint.cardIds.filter((id) => id !== c.id))}
                      className="shrink-0 rounded-md border border-[var(--flux-chrome-alpha-12)] px-2 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-danger)] hover:text-[var(--flux-danger)] disabled:opacity-50"
                    >
                      {t("remove")}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editable && !boardMismatch ? (
        <div>
          <label className="block text-[11px] font-semibold text-[var(--flux-text-muted)] mb-1.5">{t("addSearch")}</label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("addPlaceholder")}
            disabled={patching}
            className="w-full rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-transparent px-3 py-2 text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] outline-none focus:border-[var(--flux-primary)] mb-2"
          />
          <ul className={`space-y-1 ${compact ? "max-h-[min(180px,35vh)]" : "max-h-[min(240px,40vh)]"} overflow-y-auto scrollbar-kanban`}>
            {addablePool.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--flux-chrome-alpha-06)] px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--flux-text)] truncate">{c.title}</p>
                  <p className="text-[10px] text-[var(--flux-text-muted)]">{bucketLabel(c.bucket)}</p>
                </div>
                <button
                  type="button"
                  disabled={patching}
                  onClick={() => void patchIds([...sprint.cardIds, c.id])}
                  className="shrink-0 rounded-md bg-[var(--flux-primary)] px-2 py-1 text-[10px] font-semibold text-white hover:opacity-95 disabled:opacity-50"
                >
                  {t("add")}
                </button>
              </li>
            ))}
          </ul>
          {addablePool.length === 0 && query.trim() ? (
            <p className="text-[11px] text-[var(--flux-text-muted)] mt-1">{t("noMatches")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
