"use client";

import { useRef } from "react";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useTranslations } from "next-intl";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  intent?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText,
  cancelText,
  intent = "primary",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const t = useTranslations("confirmDialog");
  const resolvedConfirmText = confirmText ?? t("confirm");
  const resolvedCancelText = cancelText ?? t("cancel");

  useModalA11y({
    open,
    onClose: onCancel,
    containerRef: panelRef,
    initialFocusRef: cancelBtnRef,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[var(--flux-z-modal-critical)] flex items-center justify-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad)] p-6 min-w-[280px] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="font-display font-bold text-[var(--flux-text)] text-base mb-2">
          {title}
        </h3>
        {description && <p className="text-sm text-[var(--flux-text-muted)] mb-4">{description}</p>}

        <div className="flex gap-3 justify-end pt-2 border-t border-[var(--flux-chrome-alpha-08)] mt-4">
          <button ref={cancelBtnRef} type="button" onClick={onCancel} className="btn-secondary">
            {resolvedCancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={intent === "danger" ? "btn-danger-solid" : "btn-primary"}
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

