"use client";

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { CardModalAiOverlay } from "@/components/kanban/card-modal-ai-overlay";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { CardEditForm } from "@/components/kanban/card-modal-tabs/card-edit-form";

const CardAiContextTab = lazy(() => import("@/components/kanban/card-modal-tabs/card-ai-context-tab"));
const CardLinksPanel = lazy(() => import("@/components/kanban/card-modal-tabs/card-links-panel"));
const CardDocRefsPanel = lazy(() => import("@/components/kanban/card-modal-tabs/card-doc-refs-panel"));
const CardHistoryTab = lazy(() => import("@/components/kanban/card-modal-tabs/card-history-tab"));

const TAB_STORAGE_PREFIX = "flux-card-modal-tab:";

export type CardModalTabId = "edit" | "ai" | "links" | "docs" | "history";

const VALID_TABS = new Set<CardModalTabId>(["edit", "ai", "links", "docs", "history"]);

function readStoredTab(cardId: string): CardModalTabId {
  if (typeof window === "undefined") return "edit";
  try {
    const raw = sessionStorage.getItem(`${TAB_STORAGE_PREFIX}${cardId}`);
    if (raw && VALID_TABS.has(raw as CardModalTabId)) return raw as CardModalTabId;
  } catch {
    /* sessionStorage blocked */
  }
  return "edit";
}

function writeStoredTab(cardId: string, tab: CardModalTabId) {
  try {
    sessionStorage.setItem(`${TAB_STORAGE_PREFIX}${cardId}`, tab);
  } catch {
    /* ignore */
  }
}

export function CardModalLayout() {
  const {
    card,
    mode,
    onClose,
    handleSave,
    onDelete,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    dialogRef,
    closeBtnRef,
    t,
  } = useCardModal();

  const [activeTab, setActiveTabState] = useState<CardModalTabId>(() => readStoredTab(card.id));

  useEffect(() => {
    setActiveTabState(readStoredTab(card.id));
  }, [card.id]);

  const setActiveTab = useCallback(
    (tab: CardModalTabId) => {
      setActiveTabState(tab);
      writeStoredTab(card.id, tab);
    },
    [card.id]
  );

  useModalA11y({
    open: !confirmDeleteOpen,
    onClose,
    containerRef: dialogRef,
    initialFocusRef: closeBtnRef,
  });

  useLayoutEffect(() => {
    const uid = `${card.id}-${Math.random().toString(36).slice(2, 9)}`;
    const start = `flux-card-modal-open-start-${uid}`;
    const end = `flux-card-modal-open-end-${uid}`;
    performance.mark(start);
    const raf = requestAnimationFrame(() => {
      performance.mark(end);
      try {
        performance.measure("card-modal-open", start, end);
      } catch {
        /* measure API */
      }
      if (process.env.NODE_ENV === "development") {
        const entries = performance.getEntriesByName("card-modal-open", "measure");
        const last = entries[entries.length - 1];
        if (last && last.duration > 100) {
          console.warn(`[card-modal] open ${last.duration.toFixed(1)}ms (target <100ms)`);
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [card.id]);

  const tabItems: { id: CardModalTabId; labelKey: "edit" | "ai" | "links" | "docs" | "history" }[] = [
    { id: "edit", labelKey: "edit" },
    { id: "ai", labelKey: "ai" },
    { id: "links", labelKey: "links" },
    { id: "docs", labelKey: "docs" },
    { id: "history", labelKey: "history" },
  ];

  const tabSuspense = (
    <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--flux-text-muted)]">
      {t("cardModal.tabLoading")}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6 card-modal-backdrop">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl motion-safe:transition-[background-color] motion-safe:duration-300"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="relative flex w-full max-w-[760px] flex-col overflow-hidden rounded-3xl border border-[rgba(108,92,231,0.22)] bg-[var(--flux-surface-card)] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_32px_96px_-24px_rgba(0,0,0,0.65),0_0_120px_-40px_rgba(108,92,231,0.35)] max-h-[min(90vh,880px)] card-modal-content"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-modal-title"
        tabIndex={-1}
      >
        <div
          className="card-modal-accent h-[3px] shrink-0"
          style={{
            background: "linear-gradient(90deg, var(--flux-primary), var(--flux-secondary), var(--flux-primary))",
            backgroundSize: "200% 100%",
          }}
        />

        <header className="relative shrink-0 overflow-hidden border-b border-[rgba(255,255,255,0.06)] px-8 pb-5 pt-7">
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full opacity-[0.14] blur-3xl motion-safe:transition-opacity"
            style={{
              background: "radial-gradient(circle at center, var(--flux-primary) 0%, transparent 68%)",
            }}
          />
          <div
            className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full opacity-[0.08] blur-3xl"
            style={{
              background: "radial-gradient(circle at center, var(--flux-secondary) 0%, transparent 70%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
                  {mode === "edit" ? t("cardModal.modePill.edit") : t("cardModal.modePill.create")}
                </span>
                {mode === "edit" && (
                  <span className="inline-flex items-center rounded-full border border-[rgba(116,185,255,0.35)] bg-[rgba(116,185,255,0.1)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--flux-info)]">
                    {card.id}
                  </span>
                )}
              </div>
              <h2 id="card-modal-title" className="font-display text-2xl font-bold tracking-tight text-[var(--flux-text)]">
                {mode === "edit" ? t("cardModal.header.title.edit") : t("cardModal.header.title.new")}
              </h2>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[var(--flux-text-muted)]">
                {mode === "edit" ? t("cardModal.header.description.edit") : t("cardModal.header.description.new")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              ref={closeBtnRef}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] text-[var(--flux-text-muted)] motion-safe:transition-all motion-safe:duration-200 hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--flux-text)] motion-safe:hover:rotate-90 active:scale-95"
              aria-label={t("cardModal.aria.close")}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label={t("cardModal.tabsNavAria")}>
            {tabItems.map(({ id, labelKey }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  id={`card-modal-tab-${id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold font-display transition-all duration-200 ${
                    selected
                      ? "bg-[rgba(108,92,231,0.22)] text-[var(--flux-primary-light)] border border-[rgba(108,92,231,0.45)] shadow-[0_0_0_1px_rgba(108,92,231,0.12)]"
                      : "border border-transparent text-[var(--flux-text-muted)] hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--flux-text)]"
                  }`}
                >
                  {t(`cardModal.tabs.${labelKey}`)}
                </button>
              );
            })}
          </nav>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-8 py-6 scrollbar-kanban"
          role="tabpanel"
          aria-labelledby={`card-modal-tab-${activeTab}`}
        >
          {activeTab === "edit" && <CardEditForm cardId={card.id} />}
          {activeTab === "ai" && (
            <Suspense fallback={tabSuspense}>
              <CardAiContextTab cardId={card.id} />
            </Suspense>
          )}
          {activeTab === "links" && (
            <Suspense fallback={tabSuspense}>
              <CardLinksPanel cardId={card.id} />
            </Suspense>
          )}
          {activeTab === "docs" && (
            <Suspense fallback={tabSuspense}>
              <CardDocRefsPanel cardId={card.id} />
            </Suspense>
          )}
          {activeTab === "history" && (
            <Suspense fallback={tabSuspense}>
              <CardHistoryTab cardId={card.id} />
            </Suspense>
          )}

          <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-[rgba(255,255,255,0.08)] flex-wrap">
            {mode === "edit" && onDelete && (
              <button type="button" onClick={() => setConfirmDeleteOpen(true)} className="mr-auto btn-danger">
                {t("cardModal.buttons.delete")}
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-secondary">
              {t("cardModal.buttons.cancel")}
            </button>
            <button type="button" onClick={handleSave} className="btn-primary">
              {t("cardModal.buttons.save")}
            </button>
          </div>
        </div>

        <CardModalAiOverlay />

        <ConfirmDialog
          open={confirmDeleteOpen}
          title={t("cardModal.confirmDelete.title")}
          description={t("cardModal.confirmDelete.description")}
          intent="danger"
          confirmText={t("cardModal.confirmDelete.confirm")}
          cancelText={t("cardModal.confirmDelete.cancel")}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={() => {
            onDelete?.(card.id);
            setConfirmDeleteOpen(false);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
