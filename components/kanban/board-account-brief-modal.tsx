"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useToast } from "@/context/toast-context";
import { apiGet, ApiError } from "@/lib/api-client";

type BoardAccountBriefModalProps = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  getHeaders: () => Record<string, string>;
};

export function BoardAccountBriefModal({ open, onClose, boardId, getHeaders }: BoardAccountBriefModalProps) {
  const t = useTranslations("kanban.board.productGoalStrip");
  const { pushToast } = useToast();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;
  useModalA11y({ open, onClose, containerRef: dialogRef, initialFocusRef: closeBtnRef });

  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMarkdown(null);
    try {
      const data = await apiGet<{ markdown?: string; error?: string }>(
        `/api/boards/${encodeURIComponent(boardId)}/account-brief-ai`,
        getHeadersRef.current()
      );
      if (data.error) throw new Error(data.error);
      setMarkdown(String(data.markdown ?? "").trim() || "—");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "—";
      pushToast({ kind: "error", title: t("briefError") });
      setMarkdown(`_Erro: ${msg}_`);
    } finally {
      setLoading(false);
    }
  }, [boardId, pushToast, t]);

  useEffect(() => {
    if (!open) {
      setMarkdown(null);
      return;
    }
    void load();
  }, [open, load]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center p-4 bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-labelledby="account-brief-title"
        className="w-full max-w-2xl rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-xl max-h-[min(90vh,720px)] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--flux-border-muted)]">
          <h2 id="account-brief-title" className="text-lg font-display font-bold text-[var(--flux-text)]">
            {t("accountBrief")}
          </h2>
          <button
            type="button"
            ref={closeBtnRef}
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-10)]"
            aria-label={t("briefClose")}
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 scrollbar-kanban text-sm text-[var(--flux-text)]">
          {loading ? (
            <p className="text-[var(--flux-text-muted)]">{t("briefLoading")}</p>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{markdown ?? "—"}</pre>
          )}
        </div>
        <div className="p-4 border-t border-[var(--flux-border-muted)] flex justify-between gap-2">
          <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={() => void load()} disabled={loading}>
            {loading ? "…" : t("briefRefresh")}
          </button>
          <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={onClose}>
            {t("briefClose")}
          </button>
        </div>
      </div>
    </div>
  );
}
