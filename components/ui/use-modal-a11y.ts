"use client";

import { useEffect, useRef, type RefObject } from "react";

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
    if (el.hidden) return false;
    if (typeof window !== "undefined") {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  });
}

/**
 * Acessibilidade de modal: foco inicial + trap Tab + Escape.
 * Deps **somente [open]** — refs fecham sobre `onClose`/container; evita React #185.
 */
export function useModalA11y({ open, onClose, containerRef, initialFocusRef }: UseModalA11yArgs) {
  const lastFocusedElRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const el = containerRef.current;
      if (!el) return;

      const focusable = getFocusableElements(el);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const activeInside = Boolean(active && el.contains(active));

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
    };

    document.addEventListener("keydown", onKeyDownCapture, true);
    return () => {
      document.removeEventListener("keydown", onKeyDownCapture, true);
      lastFocusedElRef.current?.focus?.();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- só [open]; refs + onCloseRef evitam loop (#185)
}
