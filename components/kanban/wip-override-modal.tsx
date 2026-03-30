"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import type { WipOverridePending } from "./hooks/useBoardState";

type WipOverrideModalProps = {
  pending: WipOverridePending | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
};

export function WipOverrideModal({ pending, onConfirm, onClose }: WipOverrideModalProps) {
  const t = useTranslations("kanban.board.wipOverride");
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({ open: Boolean(pending), onClose, containerRef: dialogRef, initialFocusRef: closeRef });

  useEffect(() => {
    if (pending) setReason("");
  }, [pending]);

  if (!pending) return null;

  const canSubmit = reason.trim().length >= 8;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-labelledby="wip-override-title"
        className="w-full max-w-md rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-5 shadow-xl"
      >
        <h2 id="wip-override-title" className="font-display text-lg font-bold text-[var(--flux-text)]">
          {t("title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("body")}</p>
        <label className="mt-4 block text-xs font-semibold text-[var(--flux-text-muted)]">{t("reasonLabel")}</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-1 w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-3 py-2 text-sm text-[var(--flux-text)]"
          placeholder={t("reasonPlaceholder")}
        />
        <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("reasonHint")}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onConfirm(reason.trim());
            }}
            className="rounded-lg border border-[var(--flux-warning-foreground)] bg-[var(--flux-amber-alpha-18)] px-3 py-2 text-xs font-semibold text-[var(--flux-text)] disabled:opacity-40"
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
