"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { apiPost, ApiError } from "@/lib/api-client";
import { LSS_ASSIST_MODES, type LssAssistMode } from "@/lib/lss-assist-prompt";
import { useBoardStore } from "@/stores/board-store";

export type BoardLssAssistPanelProps = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  getHeaders: () => Record<string, string>;
};

export function BoardLssAssistPanel({ open, onClose, boardId, getHeaders }: BoardLssAssistPanelProps) {
  const t = useTranslations("kanban.board.lssAssist");
  const db = useBoardStore((s) => s.db);
  const cards = db?.cards ?? [];
  const [mode, setMode] = useState<LssAssistMode>("project_charter");
  const [context, setContext] = useState("");
  const [cardId, setCardId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState("");

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({ open, onClose, containerRef: dialogRef, initialFocusRef: closeBtnRef });

  const runAssist = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMarkdown("");
    try {
      const res = await apiPost<{
        markdown?: string;
        error?: string;
      }>(`/api/boards/${encodeURIComponent(boardId)}/lss-assist`, { mode, context, cardId: cardId.trim() || undefined }, getHeaders());
      if (res.error) {
        setError(res.error);
        return;
      }
      setMarkdown(String(res.markdown ?? "").trim());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [boardId, context, cardId, getHeaders, mode, t]);

  const copyOut = useCallback(async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      /* ignore */
    }
  }, [markdown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center p-4 bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-labelledby="lss-assist-title"
        className="w-full max-w-lg rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-xl max-h-[min(90vh,720px)] flex flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--flux-border-muted)] shrink-0">
          <h2 id="lss-assist-title" className="text-lg font-display font-bold text-[var(--flux-text)]">
            {t("title")}
          </h2>
          <button
            type="button"
            ref={closeBtnRef}
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-10)] hover:text-[var(--flux-text)]"
            aria-label={t("closeAria")}
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto scrollbar-kanban flex-1 min-h-0">
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide mb-1">
              {t("modeLabel")}
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as LssAssistMode)}
              className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-sm text-[var(--flux-text)]"
            >
              {LSS_ASSIST_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`modes.${m}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide mb-1">
              {t("contextLabel")}
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-sm text-[var(--flux-text)]"
              placeholder={t("contextPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide mb-1">
              {t("cardIdLabel")}
            </label>
            <select
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-sm text-[var(--flux-text)]"
            >
              <option value="">{t("cardIdNone")}</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title?.slice(0, 80) || c.id}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <p className="text-sm text-[var(--flux-danger)] rounded-lg border border-[var(--flux-danger-alpha-30)] bg-[var(--flux-danger-alpha-08)] px-3 py-2">
              {error}
            </p>
          ) : null}

          {markdown ? (
            <div className="rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-06)] p-3 max-h-[220px] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-[12px] text-[var(--flux-text)] font-sans leading-relaxed">{markdown}</pre>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 p-4 border-t border-[var(--flux-border-muted)] shrink-0">
          <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={onClose}>
            {t("close")}
          </button>
          {markdown ? (
            <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={() => void copyOut()}>
              {t("copy")}
            </button>
          ) : null}
          <button type="button" className="btn-primary text-sm py-2 px-3 disabled:opacity-50" disabled={loading} onClick={() => void runAssist()}>
            {loading ? t("generating") : t("generate")}
          </button>
        </div>
      </div>
    </div>
  );
}
