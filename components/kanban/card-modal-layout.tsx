"use client";

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useTranslations as useCollabTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useBoardCollabStore } from "@/stores/board-collab-store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { CardModalAiOverlay } from "@/components/kanban/card-modal-ai-overlay";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { CardEditForm } from "@/components/kanban/card-modal-tabs/card-edit-form";

const CardAiContextTab = lazy(() => import("@/components/kanban/card-modal-tabs/card-ai-context-tab"));
const CardLinksPanel = lazy(() => import("@/components/kanban/card-modal-tabs/card-links-panel"));
const CardDocRefsPanel = lazy(() => import("@/components/kanban/card-modal-tabs/card-doc-refs-panel"));
const CardHistoryTab = lazy(() => import("@/components/kanban/card-modal-tabs/card-history-tab"));
const CardDependenciesTab = lazy(() => import("@/components/kanban/card-modal-tabs/card-dependencies-tab"));

const TAB_STORAGE_PREFIX = "flux-card-modal-tab:";

export type CardModalTabId = "edit" | "ai" | "links" | "docs" | "history" | "deps";

const VALID_TABS = new Set<CardModalTabId>(["edit", "ai", "links", "docs", "history", "deps"]);

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

const TAB_ICONS: Record<CardModalTabId, React.ReactNode> = {
  edit: (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  ),
  ai: (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  ),
  links: (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  docs: (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  history: (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  deps: (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  ),
};

const TabSkeleton = () => (
  <div className="space-y-5 py-1" aria-hidden>
    <div className="rounded-2xl border border-[var(--flux-chrome-alpha-06)] p-5">
      <div className="mb-4 h-2.5 w-28 animate-pulse rounded-full bg-[var(--flux-chrome-alpha-08)]" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-10 animate-pulse rounded-xl bg-[var(--flux-chrome-alpha-06)]" />
        <div className="h-10 animate-pulse rounded-xl bg-[var(--flux-chrome-alpha-06)]" />
      </div>
    </div>
    <div className="rounded-2xl border border-[var(--flux-chrome-alpha-06)] p-5">
      <div className="mb-4 h-2.5 w-36 animate-pulse rounded-full bg-[var(--flux-chrome-alpha-08)]" />
      <div className="h-9 w-full animate-pulse rounded-xl bg-[var(--flux-chrome-alpha-06)]" />
      <div className="mt-3 h-24 w-full animate-pulse rounded-xl bg-[var(--flux-chrome-alpha-06)]" />
    </div>
    <div className="rounded-2xl border border-[var(--flux-chrome-alpha-06)] p-5">
      <div className="mb-4 h-2.5 w-20 animate-pulse rounded-full bg-[var(--flux-chrome-alpha-08)]" />
      <div className="flex gap-2">
        <div className="h-8 w-16 animate-pulse rounded-full bg-[var(--flux-chrome-alpha-06)]" />
        <div className="h-8 w-20 animate-pulse rounded-full bg-[var(--flux-chrome-alpha-06)]" />
        <div className="h-8 w-12 animate-pulse rounded-full bg-[var(--flux-chrome-alpha-06)]" />
      </div>
    </div>
  </div>
);

export function CardModalLayout() {
  const {
    card,
    mode,
    boardId,
    getHeaders,
    onClose,
    handleSave,
    onDelete,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    dialogRef,
    closeBtnRef,
    t,
  } = useCardModal();
  const tCollab = useCollabTranslations("board.collab");
  const { user } = useAuth();
  const connectionId = useBoardCollabStore((s) => s.connectionId);
  const clientId = useBoardCollabStore((s) => s.clientId);
  const cardLocks = useBoardCollabStore((s) => s.cardLocks);

  const remoteLock = mode === "edit" && card.id ? cardLocks[card.id] : undefined;
  const showRemoteLockBanner = Boolean(remoteLock && remoteLock.userId !== user?.id);

  useEffect(() => {
    if (mode !== "edit" || !card.id?.trim() || !connectionId || !clientId) return;
    const url = `/api/boards/${encodeURIComponent(boardId)}/presence`;
    const base = { clientId, connectionId, cardId: card.id };
    void apiFetch(url, {
      method: "POST",
      body: JSON.stringify({ ...base, action: "lock" }),
      headers: getApiHeaders(getHeaders()),
    });
    return () => {
      void apiFetch(url, {
        method: "POST",
        body: JSON.stringify({ ...base, action: "unlock" }),
        headers: getApiHeaders(getHeaders()),
      });
    };
  }, [mode, card.id, boardId, clientId, connectionId, getHeaders]);

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

  /* Ctrl/Cmd + S shortcut to save */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

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

  const tabItems: {
    id: CardModalTabId;
    labelKey: "edit" | "ai" | "links" | "docs" | "history" | "deps";
  }[] = [
    { id: "edit", labelKey: "edit" },
    { id: "ai", labelKey: "ai" },
    { id: "links", labelKey: "links" },
    { id: "docs", labelKey: "docs" },
    { id: "history", labelKey: "history" },
    { id: "deps", labelKey: "deps" },
  ];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6 card-modal-backdrop">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl motion-safe:transition-[background-color] motion-safe:duration-300"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="relative flex w-full max-w-[760px] flex-col overflow-hidden rounded-3xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-modal-depth)] max-h-[min(90vh,880px)] card-modal-content"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-modal-title"
        tabIndex={-1}
      >
        {/* Animated gradient accent bar */}
        <div
          className="card-modal-accent h-[3px] shrink-0"
          style={{
            background: "linear-gradient(90deg, var(--flux-primary), var(--flux-secondary), var(--flux-primary))",
            backgroundSize: "200% 100%",
          }}
        />

        {showRemoteLockBanner && remoteLock ? (
          <div className="px-8 pt-4" role="status">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--flux-warning)]/40 bg-[var(--flux-warning)]/10 px-3 py-2.5 text-sm text-[var(--flux-text)]">
              <svg className="h-4 w-4 shrink-0 text-[var(--flux-warning)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {tCollab("remoteLock", { name: remoteLock.userName?.trim() || "…" })}
            </div>
          </div>
        ) : null}

        {/* Header */}
        <header className="relative shrink-0 overflow-hidden border-b border-[var(--flux-chrome-alpha-06)] px-8 pb-5 pt-7">
          {/* Ambient glow blobs */}
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
              {/* Mode pill + card ID badge */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
                  {mode === "edit" ? t("cardModal.modePill.edit") : t("cardModal.modePill.create")}
                </span>
                {mode === "edit" && (
                  <span className="inline-flex items-center rounded-full border border-[var(--flux-info-alpha-35)] bg-[var(--flux-info-alpha-10)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--flux-info)]">
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

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              ref={closeBtnRef}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)] text-[var(--flux-text-muted)] motion-safe:transition-all motion-safe:duration-200 hover:border-[var(--flux-chrome-alpha-18)] hover:bg-[var(--flux-chrome-alpha-08)] hover:text-[var(--flux-text)] motion-safe:hover:rotate-90 active:scale-95"
              aria-label={t("cardModal.aria.close")}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab navigation */}
          <nav className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label={t("cardModal.tabsNavAria")}>
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
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold font-display transition-all duration-200 motion-safe:active:scale-95 ${
                    selected
                      ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)] border border-[var(--flux-primary-alpha-45)] shadow-[0_0_0_1px_var(--flux-primary-alpha-12),0_2px_8px_-2px_var(--flux-primary-alpha-20)]"
                      : "border border-transparent text-[var(--flux-text-muted)] hover:border-[var(--flux-chrome-alpha-12)] hover:bg-[var(--flux-chrome-alpha-04)] hover:text-[var(--flux-text)]"
                  }`}
                >
                  {TAB_ICONS[id]}
                  {t(`cardModal.tabs.${labelKey}`)}
                </button>
              );
            })}
          </nav>
        </header>

        {/* Scrollable tab content — key triggers fade-in on tab switch */}
        <div
          className="min-h-0 flex-1 overflow-y-auto scrollbar-kanban"
          role="tabpanel"
          aria-labelledby={`card-modal-tab-${activeTab}`}
        >
          <div key={activeTab} className="px-8 py-6 card-modal-tab-panel-in">
            {activeTab === "edit" && <CardEditForm cardId={card.id} />}
            {activeTab === "ai" && (
              <Suspense fallback={<TabSkeleton />}>
                <CardAiContextTab cardId={card.id} />
              </Suspense>
            )}
            {activeTab === "links" && (
              <Suspense fallback={<TabSkeleton />}>
                <CardLinksPanel cardId={card.id} />
              </Suspense>
            )}
            {activeTab === "docs" && (
              <Suspense fallback={<TabSkeleton />}>
                <CardDocRefsPanel cardId={card.id} />
              </Suspense>
            )}
            {activeTab === "history" && (
              <Suspense fallback={<TabSkeleton />}>
                <CardHistoryTab cardId={card.id} />
              </Suspense>
            )}
            {activeTab === "deps" && (
              <Suspense fallback={<TabSkeleton />}>
                <CardDependenciesTab cardId={card.id} />
              </Suspense>
            )}
          </div>
        </div>

        {/* Sticky footer — always visible outside the scroll area */}
        <footer className="shrink-0 border-t border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)]/98 px-8 py-4 card-modal-footer-enter">
          <div className="flex flex-wrap items-center gap-3">
            {mode === "edit" && onDelete && (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="mr-auto btn-danger"
              >
                {t("cardModal.buttons.delete")}
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-secondary">
              {t("cardModal.buttons.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn-primary inline-flex items-center gap-2"
            >
              {t("cardModal.buttons.save")}
              <kbd className="hidden sm:inline-flex items-center rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] leading-none tracking-wider text-white/55">
                ⌘S
              </kbd>
            </button>
          </div>
        </footer>

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
