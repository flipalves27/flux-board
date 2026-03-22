"use client";

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AuthUser } from "@/context/auth-context";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useSidebarLayoutOptional } from "@/context/sidebar-layout-context";
import { useCopilotStore } from "@/stores/copilot-store";

const TOUR_SELECTORS = [
  '[data-tour="board-header"]',
  '[data-tour="board-column"]',
  '[data-tour="board-new-card"]',
  '[data-tour="board-card"]',
  '[data-tour="board-copilot"]',
  '[data-tour="board-daily"]',
  '[data-tour="board-reports"]',
] as const;

export type BoardProductTourHandle = {
  skip: () => void;
  redo: () => void;
};

type BoardProductTourProps = {
  user: AuthUser | null;
  setAuth: (user: AuthUser, remember?: boolean) => void;
  getHeaders: () => Record<string, string>;
  tourStep: number | null;
  onTourStepChange: (step: number | null) => void;
};

function positionPopoverNear(
  target: HTMLElement,
  pop: HTMLElement,
  setPos: Dispatch<SetStateAction<{ top: number; left: number }>>
) {
  const rect = target.getBoundingClientRect();
  const pw = Math.min(360, window.innerWidth - 32);
  const ph = pop.offsetHeight || 220;
  let top = rect.bottom + 10;
  let left = rect.left + rect.width / 2 - pw / 2;
  if (top + ph > window.innerHeight - 16) {
    top = Math.max(16, rect.top - ph - 10);
  }
  left = Math.max(16, Math.min(left, window.innerWidth - pw - 16));
  setPos((prev) => {
    if (Math.abs(prev.top - top) < 1 && Math.abs(prev.left - left) < 1) return prev;
    return { top, left };
  });
}

export const BoardProductTour = forwardRef<BoardProductTourHandle, BoardProductTourProps>(
  function BoardProductTour({ user, setAuth, getHeaders, tourStep, onTourStepChange }, ref) {
    const t = useTranslations("board.productTour");
    const router = useRouter();
    const pathname = usePathname();
    const sidebarLayout = useSidebarLayoutOptional();
    const layout = sidebarLayout?.layout ?? "desktop";
    /** Referência estável — `() => {}` novo a cada render quebrava deps do useLayoutEffect (React #185). */
    const noopOpenMobile = useCallback(() => {}, []);
    const openMobile = sidebarLayout?.openMobile ?? noopOpenMobile;

    const active = tourStep !== null;
    const stepIndex = tourStep ?? 0;
    const total = TOUR_SELECTORS.length;

    const popoverRef = useRef<HTMLDivElement | null>(null);
    const highlightRef = useRef<HTMLElement | null>(null);
    const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 80, left: 24 });
    const titleHeadingId = useId();

    const userRef = useRef(user);
    userRef.current = user;
    const getHeadersRef = useRef(getHeaders);
    getHeadersRef.current = getHeaders;
    const routerRef = useRef(router);
    routerRef.current = router;

    const persistCompleted = useCallback(async () => {
      const u = userRef.current;
      if (!u) return;
      try {
        await apiFetch("/api/users/me/product-tour", {
          method: "PATCH",
          body: JSON.stringify({ completed: true }),
          headers: getApiHeaders(getHeadersRef.current()),
        });
        setAuth({ ...u, boardProductTourCompleted: true });
      } catch {
        // preference syncs on next login
      }
    }, [setAuth]);

    const endTour = useCallback(() => {
      onTourStepChange(null);
      highlightRef.current?.classList.remove("flux-tour-highlight");
      highlightRef.current = null;
      const pop = popoverRef.current as HTMLElement & { hidePopover?: () => void };
      if (typeof pop?.hidePopover === "function") pop.hidePopover();
    }, [onTourStepChange]);

    const skip = useCallback(async () => {
      await persistCompleted();
      endTour();
    }, [persistCompleted, endTour]);

    const redo = useCallback(() => {
      useCopilotStore.getState().setOpen(false);
      onTourStepChange(0);
    }, [onTourStepChange]);

    useImperativeHandle(ref, () => ({ skip, redo }), [skip, redo]);

    /** Evita loop de updates se `?tour=1` não for removido da URL pelo primeiro replace. */
    const tourBootstrapDoneRef = useRef(false);

    useEffect(() => {
      tourBootstrapDoneRef.current = false;
    }, [pathname]);

    useEffect(() => {
      if (typeof window === "undefined") return;
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("tour") !== "1") return;
      const currentUser = userRef.current;
      if (!currentUser) return;
      if (tourBootstrapDoneRef.current) return;
      tourBootstrapDoneRef.current = true;

      sp.delete("tour");
      const qs = sp.toString();
      const hrefWithoutTour = qs ? `${pathname}?${qs}` : pathname;

      if (currentUser.boardProductTourCompleted) {
        routerRef.current.replace(hrefWithoutTour, { scroll: false });
        return;
      }
      useCopilotStore.getState().setOpen(false);
      onTourStepChange(0);
      routerRef.current.replace(hrefWithoutTour, { scroll: false });
    }, [user?.id, pathname, onTourStepChange]);

    useEffect(() => {
      if (!active) return;
      useCopilotStore.getState().setOpen(false);
    }, [active]);

    useLayoutEffect(() => {
      if (!active) return;
      const sel = TOUR_SELECTORS[stepIndex];
      if (!sel) return;

      const applyHighlight = () => {
        highlightRef.current?.classList.remove("flux-tour-highlight");
        let el = document.querySelector(sel) as HTMLElement | null;
        const finish = (node: HTMLElement) => {
          node.scrollIntoView({ block: "nearest", behavior: "auto" });
          node.classList.add("flux-tour-highlight");
          highlightRef.current = node;
          requestAnimationFrame(() => {
            const pop = popoverRef.current;
            if (pop) positionPopoverNear(node, pop, setPopoverPos);
          });
        };

        if (stepIndex === 6 && layout === "mobile") {
          openMobile();
          requestAnimationFrame(() => {
            el = document.querySelector(sel) as HTMLElement | null;
            if (el) finish(el);
          });
          return;
        }
        if (el) finish(el);
      };

      const id = requestAnimationFrame(applyHighlight);
      const onResize = () => {
        const h = highlightRef.current;
        const pop = popoverRef.current;
        if (h?.classList.contains("flux-tour-highlight") && pop) {
          positionPopoverNear(h, pop, setPopoverPos);
        }
      };
      window.addEventListener("resize", onResize);
      window.addEventListener("scroll", onResize, true);
      return () => {
        cancelAnimationFrame(id);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("scroll", onResize, true);
        highlightRef.current?.classList.remove("flux-tour-highlight");
      };
    }, [active, stepIndex, layout, openMobile]);

    useLayoutEffect(() => {
      if (!active) return;
      const pop = popoverRef.current as HTMLElement & { showPopover?: () => void };
      if (pop && typeof pop.showPopover === "function") {
        try {
          pop.showPopover();
        } catch {
          /* Popover API opcional em browsers antigos */
        }
      }
      requestAnimationFrame(() => {
        const h = highlightRef.current;
        const p = popoverRef.current;
        if (h && p) positionPopoverNear(h, p, setPopoverPos);
      });
    }, [active, stepIndex, tourStep]);

    const next = useCallback(async () => {
      if (stepIndex >= total - 1) {
        await persistCompleted();
        endTour();
        return;
      }
      onTourStepChange(stepIndex + 1);
    }, [stepIndex, total, persistCompleted, endTour, onTourStepChange]);

    const onBackdropPointerDown = useCallback((e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    if (typeof document === "undefined") return null;

    const stepKey = [
      "header",
      "column",
      "newCard",
      "card",
      "copilot",
      "daily",
      "reports",
    ][stepIndex] as "header" | "column" | "newCard" | "card" | "copilot" | "daily" | "reports";

    if (!active) return null;

    return createPortal(
      <>
        <div
          className="fixed inset-0 z-[var(--flux-z-product-tour)] bg-transparent"
          aria-hidden
          onPointerDown={onBackdropPointerDown}
        />
        <div
          ref={popoverRef}
          popover="manual"
          role="dialog"
          aria-labelledby={titleHeadingId}
          className="flux-tour-popover m-0 flex max-w-[min(360px,calc(100vw-32px))] flex-col gap-3 rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-4 text-[var(--flux-text)] shadow-[var(--flux-shadow-xl)]"
          style={{
            position: "fixed",
            top: popoverPos.top,
            left: popoverPos.left,
            zIndex: 477,
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-secondary)]">
            {t("progress", { current: stepIndex + 1, total })}
          </div>
          <h2 id={titleHeadingId} className="font-display text-sm font-bold text-[var(--flux-text)]">
            {t(`steps.${stepKey}.title`)}
          </h2>
          <p className="text-xs leading-relaxed text-[var(--flux-text-muted)]">{t(`steps.${stepKey}.body`)}</p>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => void skip()}>
              {t("skip")}
            </button>
            <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => void next()}>
              {stepIndex >= total - 1 ? t("done") : t("next")}
            </button>
          </div>
        </div>
      </>,
      document.body
    );
  }
);
