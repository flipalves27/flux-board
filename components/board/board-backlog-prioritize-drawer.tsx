"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { ScoredBacklogCard } from "@/lib/backlog/score-cards";
import { useBoardStore } from "@/stores/board-store";

type Props = {
  boardId: string;
  open: boolean;
  onClose: () => void;
  getHeaders: () => Record<string, string>;
};

export function BoardBacklogPrioritizeDrawer({ boardId, open, onClose, getHeaders }: Props) {
  const t = useTranslations("kanban.backlogPrioritize");
  const [loading, setLoading] = useState(false);
  const [justify, setJustify] = useState(false);
  const [scored, setScored] = useState<ScoredBacklogCard[]>([]);
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/backlog-prioritize`, {
        method: "POST",
        headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ justify }),
      });
      const data = (await res.json()) as { scored?: ScoredBacklogCard[]; justifications?: Record<string, string>; error?: string };
      if (!res.ok) {
        setError(data.error ?? t("error"));
        return;
      }
      setScored(data.scored ?? []);
      setJustifications(data.justifications ?? {});
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }, [boardId, getHeaders, justify, t]);

  const applyOrder = useCallback(() => {
    const ids = scored.map((s) => s.id);
    if (!ids.length) return;
    useBoardStore.getState().updateDb((d) => {
      const first = d.config.bucketOrder[0];
      const backlogKey = first && typeof first === "object" && first && "key" in first ? String((first as { key: string }).key) : "backlog";
      let i = 0;
      for (const id of ids) {
        const c = d.cards.find((x) => x.id === id);
        if (c && c.bucket === backlogKey && c.progress !== "Concluída") {
          c.order = i++;
        }
      }
    });
    onClose();
  }, [onClose, scored]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label={t("close")} onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] shadow-2xl">
        <div className="border-b border-[var(--flux-chrome-alpha-10)] px-4 py-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("title")}</h2>
          <button type="button" className="text-xs text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="px-4 py-3 space-y-3 border-b border-[var(--flux-chrome-alpha-08)]">
          <label className="flex items-center gap-2 text-xs text-[var(--flux-text)]">
            <input type="checkbox" checked={justify} onChange={(e) => setJustify(e.target.checked)} />
            {t("justify")}
          </label>
          <button type="button" className="btn-primary text-xs w-full" disabled={loading} onClick={() => void run()}>
            {loading ? t("loading") : t("run")}
          </button>
          {error ? <p className="text-xs text-[var(--flux-danger)]">{error}</p> : null}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-kanban px-4 py-3 space-y-2">
          {scored.map((row, idx) => (
            <div key={row.id} className="rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-mid)] p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[var(--flux-text-muted)]">#{idx + 1}</span>
                <span className="rounded-full border border-[var(--flux-primary-alpha-35)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-primary-light)]">
                  {row.priorityScore.toFixed(2)}
                </span>
              </div>
              <p className="mt-1 font-medium text-[var(--flux-text)] leading-snug">{row.title}</p>
              {justifications[row.id] ? <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{justifications[row.id]}</p> : null}
            </div>
          ))}
          {!scored.length && !loading ? <p className="text-xs text-[var(--flux-text-muted)]">{t("empty")}</p> : null}
        </div>
        <div className="border-t border-[var(--flux-chrome-alpha-10)] p-4 flex gap-2">
          <button type="button" className="btn-secondary text-xs flex-1" onClick={onClose}>
            {t("close")}
          </button>
          <button type="button" className="btn-primary text-xs flex-1" disabled={!scored.length} onClick={applyOrder}>
            {t("apply")}
          </button>
        </div>
      </aside>
    </div>
  );
}
