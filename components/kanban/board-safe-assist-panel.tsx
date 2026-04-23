"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { SAFE_ASSIST_MODES, type SafeAssistMode } from "@/lib/safe-assist-prompt";

export type BoardSafeAssistPanelProps = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  getHeaders: () => Record<string, string>;
};

type OrgFeatures = {
  safe_ai_premium?: boolean;
};

export function BoardSafeAssistPanel({ open, onClose, boardId, getHeaders }: BoardSafeAssistPanelProps) {
  const t = useTranslations("kanban.board.safeAssist");
  const [mode, setMode] = useState<SafeAssistMode>("pi_risk_review");
  const [context, setContext] = useState("");
  const [cardId, setCardId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [features, setFeatures] = useState<OrgFeatures | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({ open, onClose, containerRef: dialogRef, initialFocusRef: closeBtnRef });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiGet<OrgFeatures>("/api/org/features", getHeaders());
        if (!cancelled) setFeatures(r);
      } catch {
        if (!cancelled) setFeatures({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, getHeaders]);

  const runAssist = useCallback(async () => {
    if (!features?.safe_ai_premium) return;
    setLoading(true);
    setError(null);
    setMarkdown("");
    try {
      const res = await apiPost<{
        markdown?: string;
        error?: string;
      }>(
        `/api/boards/${encodeURIComponent(boardId)}/safe-assist`,
        { mode, context, cardId: cardId.trim() || undefined },
        getHeaders()
      );
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
  }, [boardId, context, cardId, getHeaders, mode, t, features?.safe_ai_premium]);

  if (!open) return null;
  const locked = !features?.safe_ai_premium;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center p-4 bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-labelledby="safe-assist-title"
        className="w-full max-w-2xl rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-xl max-h-[min(90vh,720px)] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--flux-border-muted)]">
          <h2 id="safe-assist-title" className="text-lg font-display font-bold text-[var(--flux-text)]">
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

        <div className="p-4 space-y-4">
          {locked ? (
            <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">{t("lockedHint")}</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("modeLabel")}</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as SafeAssistMode)}
                  className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-sm"
                >
                  {SAFE_ASSIST_MODES.map((m) => (
                    <option key={m} value={m}>
                      {t(`modes.${m}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("contextLabel")}</label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-sm"
                  placeholder={t("contextPlaceholder")}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("cardIdLabel")}</label>
                <input
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-sm"
                  placeholder={t("cardIdPlaceholder")}
                />
              </div>
              {error ? <p className="text-sm text-[var(--flux-danger)]">{error}</p> : null}
              {markdown ? (
                <div className="rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-elevated)] p-3 text-sm whitespace-pre-wrap text-[var(--flux-text)] max-h-64 overflow-y-auto">
                  {markdown}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-[var(--flux-border-muted)]">
          <button type="button" className="btn-secondary text-sm" onClick={onClose}>
            {t("close")}
          </button>
          {!locked ? (
            <button type="button" className="btn-primary text-sm" disabled={loading} onClick={() => void runAssist()}>
              {loading ? t("generating") : t("generate")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
