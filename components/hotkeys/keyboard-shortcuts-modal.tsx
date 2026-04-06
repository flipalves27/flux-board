"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { resolveHotkeyPatterns } from "@/lib/hotkeys/custom-bindings";

type Props = {
  open: boolean;
  onClose: () => void;
};

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded border border-[var(--flux-control-border)] bg-[var(--flux-surface-dark)] px-1.5 font-mono text-[11px] font-medium text-[var(--flux-text-muted)]">
      {children}
    </kbd>
  );
}

function formatPatternForDisplay(pattern: string): React.ReactNode {
  const parts = pattern.trim().split(/\s+/);
  return parts.map((press, i) => (
    <span key={`${press}-${i}`} className="inline-flex items-center gap-1">
      {i > 0 ? <span className="text-[var(--flux-text-muted)]">→</span> : null}
      <Kbd>{press}</Kbd>
    </span>
  ));
}

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  const t = useTranslations("hotkeys");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useModalA11y({
    open,
    onClose,
    containerRef: panelRef,
    initialFocusRef: closeBtnRef,
  });

  const patterns = useMemo(() => resolveHotkeyPatterns(), []);

  const isApple =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? navigator.userAgent);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-shortcuts-modal)] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md overflow-hidden rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-lg)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hotkeys-dialog-title"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--flux-chrome-alpha-08)] px-4 py-3">
          <h2 id="hotkeys-dialog-title" className="font-display text-base font-semibold text-[var(--flux-text)]">
            {t("title")}
          </h2>
          <p className="mt-1 text-xs text-[var(--flux-text-muted)]">{t("subtitle")}</p>
        </div>

        <div className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain px-4 py-3 scrollbar-kanban">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
            {t("groups.general")}
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start justify-between gap-3">
              <span className="text-[var(--flux-text)]">{t("goBoards")}</span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">{formatPatternForDisplay(patterns["nav.boards"])}</span>
            </li>
            <li className="flex items-start justify-between gap-3">
              <span className="text-[var(--flux-text)]">{t("goReports")}</span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">{formatPatternForDisplay(patterns["nav.reports"])}</span>
            </li>
            <li className="flex items-start justify-between gap-3">
              <span className="text-[var(--flux-text)]">{t("cheatsheet")}</span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">{formatPatternForDisplay(patterns["ui.cheatsheet"])}</span>
            </li>
            <li className="flex items-start justify-between gap-3">
              <span className="text-[var(--flux-text)]">{t("commandPalette")}</span>
              <span className="inline-flex items-center gap-1">
                <Kbd>{isApple ? "⌘" : "Ctrl"}</Kbd>
                <Kbd>K</Kbd>
              </span>
            </li>
            <li className="flex items-start justify-between gap-3">
              <span className="text-[var(--flux-text)]">{t("escape")}</span>
              <Kbd>Esc</Kbd>
            </li>
          </ul>

          <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
            {t("groups.board")}
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start justify-between gap-3">
              <span className="text-[var(--flux-text)]">{t("newCard")}</span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">{formatPatternForDisplay(patterns["board.newCard"])}</span>
            </li>
            <li className="flex items-start justify-between gap-3">
              <span className="text-[var(--flux-text)]">{t("toggleFilters")}</span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">{formatPatternForDisplay(patterns["board.toggleFilters"])}</span>
            </li>
            <li className="flex items-start justify-between gap-3">
              <span className="text-[var(--flux-text)]">{t("focusSearch")}</span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">{formatPatternForDisplay(patterns["board.focusSearch"])}</span>
            </li>
          </ul>
        </div>

        <div className="border-t border-[var(--flux-chrome-alpha-08)] px-4 py-3">
          <button ref={closeBtnRef} type="button" className="btn-primary w-full sm:w-auto" onClick={onClose}>
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
