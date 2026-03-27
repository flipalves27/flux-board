"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { LSS_ASSIST_MODES, type LssAssistMode } from "@/lib/lss-assist-prompt";
import { LSS_PREMIUM_ASSIST_MODES, type LssPremiumAssistMode } from "@/lib/lss-premium-assist-prompt";
import { useBoardStore } from "@/stores/board-store";

export type BoardLssAssistPanelProps = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  getHeaders: () => Record<string, string>;
};

type OrgFeatures = {
  lss_ai_premium?: boolean;
};

export function BoardLssAssistPanel({ open, onClose, boardId, getHeaders }: BoardLssAssistPanelProps) {
  const t = useTranslations("kanban.board.lssAssist");
  const db = useBoardStore((s) => s.db);
  const cards = db?.cards ?? [];
  const [tier, setTier] = useState<"standard" | "premium">("standard");
  const [mode, setMode] = useState<LssAssistMode>("project_charter");
  const [premiumMode, setPremiumMode] = useState<LssPremiumAssistMode>("steering_narrative");
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
    setLoading(true);
    setError(null);
    setMarkdown("");
    try {
      if (tier === "premium") {
        const res = await apiPost<{
          markdown?: string;
          error?: string;
        }>(
          `/api/boards/${encodeURIComponent(boardId)}/lss-premium-assist`,
          { mode: premiumMode, context, cardId: cardId.trim() || undefined },
          getHeaders()
        );
        if (res.error) {
          setError(res.error);
          return;
        }
        setMarkdown(String(res.markdown ?? "").trim());
        return;
      }
      const res = await apiPost<{
        markdown?: string;
        error?: string;
      }>(
        `/api/boards/${encodeURIComponent(boardId)}/lss-assist`,
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
  }, [boardId, context, cardId, getHeaders, mode, premiumMode, tier, t]);

  const copyOut = useCallback(async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      /* ignore */
    }
  }, [markdown]);

  const premiumAllowed = Boolean(features?.lss_ai_premium);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center p-4 bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-labelledby="lss-assist-title"
        className="w-full max-w-2xl rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-xl max-h-[min(90vh,760px)] flex flex-col overflow-hidden"
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

        <div className="px-4 pt-3 flex gap-2 border-b border-[var(--flux-chrome-alpha-08)] shrink-0">
          <button
            type="button"
            onClick={() => setTier("standard")}
            className={`rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors ${
              tier === "standard"
                ? "bg-[var(--flux-primary-alpha-15)] text-[var(--flux-primary-light)]"
                : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
          >
            {t("tierStandard")}
          </button>
          <button
            type="button"
            onClick={() => setTier("premium")}
            className={`rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              tier === "premium"
                ? "bg-[var(--flux-secondary-alpha-15)] text-[var(--flux-primary-light)]"
                : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
          >
            {t("tierPremium")}
            <span className="rounded bg-[var(--flux-warning-alpha-25)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--flux-warning-foreground)]">
              {t("premiumBadge")}
            </span>
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto scrollbar-kanban flex-1 min-h-0">
          {tier === "premium" && !premiumAllowed ? (
            <p className="text-sm leading-relaxed text-[var(--flux-text-muted)] rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-06)] px-3 py-2">
              {t("premiumLocked")}
            </p>
          ) : null}

          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide mb-1">
              {t("modeLabel")}
            </label>
            {tier === "standard" ? (
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
            ) : (
              <select
                value={premiumMode}
                onChange={(e) => setPremiumMode(e.target.value as LssPremiumAssistMode)}
                disabled={!premiumAllowed}
                className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-sm text-[var(--flux-text)] disabled:opacity-50"
              >
                {LSS_PREMIUM_ASSIST_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`premiumModes.${m}`)}
                  </option>
                ))}
              </select>
            )}
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
            <div className="rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-06)] p-3 max-h-[260px] overflow-y-auto">
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
          <button
            type="button"
            className="btn-primary text-sm py-2 px-3 disabled:opacity-50"
            disabled={loading || (tier === "premium" && !premiumAllowed)}
            onClick={() => void runAssist()}
          >
            {loading ? t("generating") : t("generate")}
          </button>
        </div>
      </div>
    </div>
  );
}
