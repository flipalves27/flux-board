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
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
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

/** Índice do passo «Daily» — usado p.ex. para expandir filtros no Kanban durante o tour. */
export const BOARD_PRODUCT_TOUR_DAILY_STEP_INDEX = TOUR_SELECTORS.indexOf('[data-tour="board-daily"]');

const MOBILE_SIDEBAR_DRAWER_SELECTORS = new Set<string>(['[data-tour="board-reports"]']);

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
    const [fluxyWelcomeOpen, setFluxyWelcomeOpen] = useState(false);
    const [fluxyCelebrationOpen, setFluxyCelebrationOpen] = useState(false);
    const titleHeadingId = useId();
    const fluxyWelcomeTitleId = useId();
    const fluxyCelebrateTitleId = useId();
    const welcomePrimaryRef = useRef<HTMLButtonElement | null>(null);
    const celebrationPrimaryRef = useRef<HTMLButtonElement | null>(null);

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

    const clearTourHighlightAndPopover = useCallback(() => {
      highlightRef.current?.classList.remove("flux-tour-highlight");
      highlightRef.current = null;
      const pop = popoverRef.current as HTMLElement & { hidePopover?: () => void };
      if (typeof pop?.hidePopover === "function") pop.hidePopover();
    }, []);

    const endTour = useCallback(() => {
      onTourStepChange(null);
      clearTourHighlightAndPopover();
    }, [onTourStepChange, clearTourHighlightAndPopover]);

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

    useEffect(() => {
      if (!active || stepIndex !== 0) {
        if (!active) {
          setFluxyWelcomeOpen(false);
          setFluxyCelebrationOpen(false);
        }
        return;
      }
      try {
        if (sessionStorage.getItem("fluxy:board-tour-intro-shown") === "1") return;
      } catch {
        return;
      }
      setFluxyWelcomeOpen(true);
    }, [active, stepIndex]);

    useEffect(() => {
      if (!fluxyWelcomeOpen) return;
      welcomePrimaryRef.current?.focus();
    }, [fluxyWelcomeOpen]);

    useEffect(() => {
      if (!fluxyCelebrationOpen) return;
      celebrationPrimaryRef.current?.focus();
    }, [fluxyCelebrationOpen]);

    const dismissCelebration = useCallback(() => {
      setFluxyCelebrationOpen(false);
      endTour();
    }, [endTour]);

    useEffect(() => {
      if (!fluxyCelebrationOpen) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") dismissCelebration();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [fluxyCelebrationOpen, dismissCelebration]);

    const dismissFluxyWelcome = useCallback(() => {
      try {
        sessionStorage.setItem("fluxy:board-tour-intro-shown", "1");
      } catch {
        // ignore
      }
      setFluxyWelcomeOpen(false);
    }, []);

    /** Mesmo efeito que «Pular tour» no popover: marca o tour como concluído e encerra. */
    const skipWelcomeAndEndTour = useCallback(() => {
      try {
        sessionStorage.setItem("fluxy:board-tour-intro-shown", "1");
      } catch {
        // ignore
      }
      void skip();
    }, [skip]);

    useLayoutEffect(() => {
      if (!active || fluxyWelcomeOpen || fluxyCelebrationOpen) return;
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

        if (layout === "mobile" && MOBILE_SIDEBAR_DRAWER_SELECTORS.has(sel)) {
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
    }, [active, stepIndex, layout, openMobile, fluxyWelcomeOpen, fluxyCelebrationOpen]);

    useLayoutEffect(() => {
      if (!active || fluxyWelcomeOpen || fluxyCelebrationOpen) return;
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
    }, [active, stepIndex, tourStep, fluxyWelcomeOpen, fluxyCelebrationOpen]);

    const next = useCallback(async () => {
      if (stepIndex >= total - 1) {
        await persistCompleted();
        clearTourHighlightAndPopover();
        setFluxyCelebrationOpen(true);
        return;
      }
      onTourStepChange(stepIndex + 1);
    }, [stepIndex, total, persistCompleted, clearTourHighlightAndPopover, onTourStepChange]);

    const onBackdropPointerDown = useCallback((e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    if (typeof document === "undefined") return null;

    const stepKey = ["header", "column", "newCard", "card", "copilot", "daily", "reports"][stepIndex] as
      | "header"
      | "column"
      | "newCard"
      | "card"
      | "copilot"
      | "daily"
      | "reports";

    if (!active) return null;

    return createPortal(
      <>
        {fluxyWelcomeOpen ? (
          <div
            className="fixed inset-0 z-[var(--flux-z-board-tour-fluxy-welcome)] flex items-center justify-center bg-[var(--flux-backdrop-scrim)] p-4 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
            role="presentation"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={fluxyWelcomeTitleId}
              className="w-full max-w-md rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-modal-depth)]"
            >
              <div className="flex flex-col items-center gap-4 text-center">
                <FluxyAvatar state="waving" size="header" className="scale-125" />
                <div>
                  <h2 id={fluxyWelcomeTitleId} className="font-display text-lg font-bold text-[var(--flux-text)]">
                    {t("fluxyWelcome.title")}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("fluxyWelcome.body")}</p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    ref={welcomePrimaryRef}
                    type="button"
                    className="btn-primary px-4 py-2.5 text-sm"
                    onClick={dismissFluxyWelcome}
                  >
                    {t("fluxyWelcome.startTour")}
                  </button>
                  <button type="button" className="btn-secondary px-4 py-2.5 text-sm" onClick={() => void skipWelcomeAndEndTour()}>
                    {t("skip")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : fluxyCelebrationOpen ? (
          <div
            className="fixed inset-0 z-[var(--flux-z-board-tour-fluxy-welcome)] flex items-center justify-center bg-[var(--flux-backdrop-scrim)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[3px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
            role="presentation"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={fluxyCelebrateTitleId}
              className="relative w-full max-w-lg overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-surface-card)] px-6 pb-8 pt-10 shadow-[var(--flux-shadow-modal-depth)] sm:px-10 sm:pb-10 sm:pt-12"
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[var(--flux-primary-alpha-15)] to-transparent"
                aria-hidden
              />
              <div className="relative flex flex-col items-center gap-6 text-center">
                <div className="flex min-h-[9.5rem] items-center justify-center sm:min-h-[11rem]">
                  <FluxyAvatar
                    state="celebrating"
                    size="header"
                    showConfetti
                    className="scale-[1.55] motion-safe:transition-transform motion-safe:duration-500 sm:scale-[1.85]"
                  />
                </div>
                <div className="max-w-md space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-secondary)]">
                    {t("fluxyCelebrate.kicker")}
                  </p>
                  <h2 id={fluxyCelebrateTitleId} className="font-display text-xl font-bold tracking-tight text-[var(--flux-text)] sm:text-2xl">
                    {t("fluxyCelebrate.title")}
                  </h2>
                  <p className="text-sm leading-relaxed text-[var(--flux-text-muted)] sm:text-[15px]">{t("fluxyCelebrate.body")}</p>
                </div>
                <button
                  ref={celebrationPrimaryRef}
                  type="button"
                  className="btn-primary mt-1 min-h-[44px] px-6 py-2.5 text-sm font-semibold sm:min-w-[12rem]"
                  onClick={dismissCelebration}
                >
                  {t("fluxyCelebrate.cta")}
                </button>
              </div>
            </div>
          </div>
        ) : (
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
          </>
        )}
      </>,
      document.body
    );
  }
);
