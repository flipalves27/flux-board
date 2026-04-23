"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiGet, ApiError } from "@/lib/api-client";

type Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
};

export function BoardHealthBriefingButton({ boardId, getHeaders }: Props) {
  const t = useTranslations("kanban.board.intelligence");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);

  const load = async () => {
    setOpen(true);
    if (markdown) return;
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ markdown?: string }>(
        `/api/boards/${encodeURIComponent(boardId)}/board-health-briefing-ai`,
        getHeaders()
      );
      setMarkdown(String(data?.markdown ?? "").trim() || null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setError(t("healthBriefingErrorAuth"));
      } else if (e instanceof ApiError && e.status === 402) {
        setError(t("healthBriefingErrorPlan"));
      } else {
        setError(t("healthBriefingErrorGeneric"));
      }
      setMarkdown(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shrink-0 min-w-0 max-w-full">
      <button
        type="button"
        onClick={() => void load()}
        className="rounded-full border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-surface-mid)] px-2.5 py-1 text-[10px] font-semibold text-[var(--flux-text)] hover:border-[var(--flux-primary-alpha-45)] hover:bg-[var(--flux-primary-alpha-08)] transition-colors"
      >
        {t("healthBriefingCta")}
      </button>
      {open ? (
        <div className="mt-2 w-full min-w-0 max-w-2xl rounded-lg border border-[var(--flux-border-muted)] bg-[var(--flux-surface-card)] p-3 text-left">
          {loading ? (
            <p className="text-[11px] text-[var(--flux-text-muted)]">{t("healthBriefingLoading")}</p>
          ) : error ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-200">{error}</p>
          ) : markdown ? (
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--flux-text)]">
              {markdown}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:underline"
          >
            {t("healthBriefingClose")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
