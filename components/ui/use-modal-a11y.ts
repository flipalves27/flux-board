"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";

type UseModalA11yArgs = {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    const ariaHidden = el.getAttribute("aria-hidden");
    if (ariaHidden === "true") return false;
    if (!el.offsetParent && el.offsetParent !== null) return false; // Best-effort visibility
    return el.tabIndex !== -1;
  });
}

export function useModalA11y({ open, onClose, containerRef, initialFocusRef }: UseModalA11yArgs) {
  const lastFocusedElRef = useRef<HTMLElement | null>(null);
  /** Evita loop #185: `onClose` costuma ser inline no pai — não pode estar nas deps de handlers/effect. */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handlers = useMemo(() => {
    return {
      onKeyDownCapture: (e: KeyboardEvent) => {
        if (!open) return;

        if (e.key === "Escape") {
          e.preventDefault();
          onCloseRef.current();
          return;
        }

        if (e.key !== "Tab") return;

        const container = containerRef.current;
        if (!container) return;

        const focusable = getFocusableElements(container);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        const active = document.activeElement as HTMLElement | null;
        const activeInside = Boolean(active && container.contains(active));

        if (e.shiftKey) {
          if (!activeInside || active === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (!activeInside || active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      },
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    lastFocusedElRef.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (container) {
      const initial = initialFocusRef?.current;
      if (initial && container.contains(initial) && typeof initial.focus === "function") {
        initial.focus();
      } else {
        const focusable = getFocusableElements(container);
        focusable[0]?.focus?.();
      }
    }

    document.addEventListener("keydown", handlers.onKeyDownCapture, true);

    return () => {
      document.removeEventListener("keydown", handlers.onKeyDownCapture, true);
      lastFocusedElRef.current?.focus?.();
    };
  }, [handlers, initialFocusRef, open]);
}

