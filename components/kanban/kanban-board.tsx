"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { resolveHotkeyPatterns } from "@/lib/hotkeys/custom-bindings";
import type { DragEndEvent } from "@dnd-kit/core";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useBoardStore, registerCsvImportInput } from "@/stores/board-store";
import { useCopilotStore } from "@/stores/copilot-store";
import { registerRecentCard } from "@/lib/recent-cards";
import { useToast } from "@/context/toast-context";
import { useBoardNlqUiStore } from "@/stores/board-nlq-ui-store";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useTranslations } from "next-intl";
import { useBoardPersistence } from "./hooks/useBoardPersistence";
import { useBoardFilters } from "./hooks/useBoardFilters";
import { apiGet } from "@/lib/api-client";
import { useSprintStore } from "@/stores/sprint-store";
import type { SprintData } from "@/lib/schemas";
import { useBoardState } from "./hooks/useBoardState";
import { useBoardRealtime } from "./hooks/useBoardRealtime";
import { useBoardDnd } from "./hooks/useBoardDnd";
import { BoardNlqDock } from "./board-nlq-dock";
import { BoardMetricsStrip } from "./board-metrics-strip";
import { KanbanBoardCanvas } from "./kanban-board-canvas";
import { BoardCardSelectionProvider, useBoardCardSelection } from "./board-card-selection-context";
import { KanbanBatchSelectionBar } from "./kanban-batch-selection-bar";
import { BoardSummaryDock } from "./board-summary-dock";
import { BoardExecutionInsightsPanel } from "./board-execution-insights-panel";
import { KanbanBoardOverlays } from "./kanban-board-overlays";
import { buildKanbanOverlayModel } from "./kanban-overlay-model";
import { SkeletonKanbanBoard } from "@/components/skeletons/flux-skeletons";

function SelectionClearBridge({ clearRef }: { clearRef: React.MutableRefObject<(() => void) | null> }) {
  const { clearSelection } = useBoardCardSelection();
  clearRef.current = clearSelection;
  return null;
}

function DailyIaFab({ onOpen }: { onOpen: () => void }) {
  const tFab = useTranslations("kanban.board.filters");
  const copilotOpen = useCopilotStore((s) => s.open);
  const fabRight = copilotOpen ? "right-[calc(min(440px,92vw)+16px)]" : "right-4";
  return (
    <button
      type="button"
      data-tour="board-daily"
      className={`fixed z-[467] transition-all duration-200 active:scale-[0.98] ${fabRight} top-[280px]`}
      onClick={onOpen}
      aria-label={tFab("dailyButton")}
    >
      <span className="relative inline-flex items-center gap-2 rounded-l-xl rounded-r-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-mid)] px-2.5 py-2 text-[var(--flux-text)] shadow-[var(--flux-shadow-copilot-bubble)] backdrop-blur-md hover:border-[var(--flux-primary)]">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
            <path d="M12 2l2.09 6.26L20 10l-5.91 4.26L16.18 21 12 17.27 7.82 21l2.09-6.74L4 10l5.91-1.74z" />
          </svg>
        </span>
        <span className="text-[11px] font-semibold whitespace-nowrap">{tFab("dailyButton")}</span>
      </span>
    </button>
  );
}

type KanbanBatchToolbarProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  boardView: string;
  moveCardsBatch: (orderedIds: string[], newBucket: string, insertIndex: number) => void;
  getCardsByBucket: (key: string) => import("@/app/board/[id]/page").CardData[];
  buckets: import("@/app/board/[id]/page").BucketConfig[];
  priorities: string[];
  patchCardFromTable: (
    cardId: string,
    patch: Partial<Pick<import("@/app/board/[id]/page").CardData, "title" | "priority" | "dueDate" | "bucket" | "tags">>
  ) => void;
  setConfirmDelete: (v: import("@/stores/ui-store").ConfirmDeleteState) => void;
};

function KanbanBatchToolbarBound({
  boardView,
  t,
  moveCardsBatch,
  getCardsByBucket,
  buckets,
  priorities,
  patchCardFromTable,
  setConfirmDelete,
}: KanbanBatchToolbarProps) {
  if (boardView !== "kanban") return null;
  const { selectedIds, clearSelection, getOrderedSelectionIds } = useBoardCardSelection();
  const n = selectedIds.size;
  if (n === 0) return null;
  const ordered = getOrderedSelectionIds();
  return (
    <KanbanBatchSelectionBar
      t={t}
      count={n}
      buckets={buckets}
      priorities={priorities}
      onMoveToBucket={(bucketKey) => {
        const without = getCardsByBucket(bucketKey).filter((c) => !selectedIds.has(c.id));
        moveCardsBatch(ordered, bucketKey, without.length);
        clearSelection();
      }}
      onSetPriority={(prio) => {
        for (const id of selectedIds) {
          patchCardFromTable(id, { priority: prio });
        }
        clearSelection();
      }}
      onDelete={() => setConfirmDelete({ type: "cardsBatch", ids: [...selectedIds] })}
      onClear={clearSelection}
    />
  );
}

export interface KanbanBoardProps {
  boardName: string;
  boardId: string;
  getHeaders: () => Record<string, string>;
  filterLabels: string[];
  priorities: string[];
  progresses: string[];
  directions: string[];
  /** Expande filtros para o passo do tour (Daily Insights). */
  productTourExpandFilters?: boolean;
  /** Quando false, polling remoto não sobrescreve o board (ex.: salvando). */
  allowExternalMerge?: boolean;
}

function KanbanBoardLoaded({
  boardName,
  boardId,
  getHeaders,
  filterLabels,
  priorities,
  progresses,
  directions,
  productTourExpandFilters,
  allowExternalMerge = true,
}: KanbanBoardProps) {
  const t = useTranslations("kanban");
  const router = useRouter();
  const searchParams = useSearchParams();
  /** String estável — `searchParams` pode mudar de identidade a cada render no App Router. */
  const searchParamsKey = searchParams.toString();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const routerRef = useRef(router);
  routerRef.current = router;
  const { user } = useAuth();
  const { pushToast } = useToast();
  const db = useBoardStore((s) => s.db)!;
  const updateDb = useBoardStore((s) => s.updateDb);

  const [visibleColumnKey, setVisibleColumnKey] = useState<string | null>(null);
  const onVisibleColumnKeyChange = useCallback((key: string | null) => {
    setVisibleColumnKey((prev) => (prev === key ? prev : key));
  }, []);

  const collab = useBoardRealtime({
    boardId,
    getHeaders,
    userId: user?.id ?? "",
    displayName: (user?.name?.trim() || user?.username || "").trim(),
    allowExternalMerge,
    visibleColumnKey,
  });

  const persistence = useBoardPersistence(boardId);
  const {
    boardView,
    setBoardView,
    activePrio,
    setActivePrio,
    activeLabels,
    setActiveLabels,
    searchQuery,
    setSearchQuery,
  } = persistence;

  const nlqIdsArr = useBoardNlqUiStore((s) => s.allowedIdsByBoard[boardId]);
  const nlqAllowedIds = useMemo(() => {
    if (!nlqIdsArr) return null;
    return new Set(nlqIdsArr);
  }, [nlqIdsArr]);

  const setActiveSprintBoard = useSprintStore((s) => s.setActiveSprint);
  const activeSprintBoard = useSprintStore((s) => s.activeSprint[boardId] ?? null);
  const sprintScopeKey = `flux-kanban-sprint-scope:${boardId}`;
  const [sprintScopeOnly, setSprintScopeOnly] = useState(false);

  useEffect(() => {
    try {
      setSprintScopeOnly(localStorage.getItem(sprintScopeKey) === "1");
    } catch {
      setSprintScopeOnly(false);
    }
  }, [sprintScopeKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<{ sprint: SprintData | null }>(
          `/api/boards/${encodeURIComponent(boardId)}/sprints/active`,
          getHeaders()
        );
        if (!cancelled) setActiveSprintBoard(boardId, data.sprint ?? null);
      } catch {
        if (!cancelled) setActiveSprintBoard(boardId, null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, getHeaders, setActiveSprintBoard]);

  const sprintCardIdSet = useMemo(() => {
    if (!sprintScopeOnly) return null;
    if (!activeSprintBoard || activeSprintBoard.status !== "active") return null;
    const ids = activeSprintBoard.cardIds ?? [];
    return new Set(ids);
  }, [sprintScopeOnly, activeSprintBoard]);

  const toggleSprintScopeOnly = useCallback(() => {
    setSprintScopeOnly((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(sprintScopeKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [sprintScopeKey]);

  const board = useBoardState({
    boardId,
    getHeaders,
    filterLabels,
    priorities,
    progresses,
    directions,
    onAfterCardBucketsChange: collab.notifyBucketsChanged,
    onAfterColumnReorder: collab.notifyColumnReorder,
  });

  const filters = useBoardFilters({
    cards: board.cards,
    buckets: board.buckets,
    activePrio,
    setActivePrio,
    activeLabels,
    setActiveLabels,
    searchQuery,
    setSearchQuery,
    nlqAllowedIds,
    forceExpandTourFilters: productTourExpandFilters,
    sprintCardIdSet,
  });

  const hotkeyPatterns = useMemo(() => resolveHotkeyPatterns(), []);
  const { setPriorityBarVisible, searchInputRef } = filters;

  const boardHotkeyBindings = useMemo(() => {
    const p = hotkeyPatterns;
    const m: Record<string, (e: KeyboardEvent) => void> = {};
    m[p["board.newCard"]] = (e) => {
      e.preventDefault();
      routerRef.current.push(`${localeRoot}/board/${boardId}?newCard=1`);
    };
    m[p["board.toggleFilters"]] = (e) => {
      e.preventDefault();
      setPriorityBarVisible((v) => !v);
    };
    m[p["board.focusSearch"]] = (e) => {
      e.preventDefault();
      setPriorityBarVisible(true);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    };
    return m;
  }, [boardId, hotkeyPatterns, localeRoot, searchInputRef, setPriorityBarVisible]);

  useHotkeys(boardHotkeyBindings);

  const dnd = useBoardDnd({
    buckets: board.buckets,
    cards: board.cards,
    getCardsByBucket: filters.getCardsByBucket,
    moveCardsBatch: board.moveCardsBatch,
    reorderColumns: board.reorderColumns,
  });

  const clearSelectionRef = useRef<(() => void) | null>(null);

  const handleKanbanDragEnd = useCallback(
    (e: DragEndEvent) => {
      const raw = e.active.data.current as { dragIds?: string[] } | undefined;
      const batch = (raw?.dragIds?.length ?? 0) > 1;
      dnd.handleDragEnd(e);
      if (e.over && batch) clearSelectionRef.current?.();
    },
    [dnd]
  );

  const { dailyOpen, openDailyModal, closeDailyModal, dailyDeleteConfirmId } = board.dailySession;
  const cardsRef = useRef(board.cards);
  const bucketsRef = useRef(board.buckets);
  const tRef = useRef(t);
  const handledQueryRef = useRef<string | null>(null);
  const setModalCardRef = useRef(board.setModalCard);
  const setModalModeRef = useRef(board.setModalMode);
  cardsRef.current = board.cards;
  bucketsRef.current = board.buckets;
  tRef.current = t;
  setModalCardRef.current = board.setModalCard;
  setModalModeRef.current = board.setModalMode;

  useEffect(() => {
    const cardId = searchParams.get("card");
    const newCard = searchParams.get("newCard");
    const copilot = searchParams.get("copilot");
    if (!cardId && newCard !== "1" && copilot !== "1") {
      handledQueryRef.current = null;
      return;
    }

    const queryKey = `${boardId}|${searchParamsKey}`;
    if (handledQueryRef.current === queryKey) return;
    handledQueryRef.current = queryKey;

    if (cardId) {
      const c = useBoardStore.getState().db?.cards.find((x) => x.id === cardId);
      if (c) {
        setModalCardRef.current(c);
        setModalModeRef.current("edit");
      }
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }
    if (newCard === "1") {
      const buckets = bucketsRef.current;
      const cards = cardsRef.current;
      const firstBucket = buckets[0]?.key;
      if (firstBucket) {
        const order = cards.filter((x) => x.bucket === firstBucket).length;
        setModalCardRef.current({
          id: "",
          bucket: firstBucket,
          priority: "Média",
          progress: "Não iniciado",
          title: "",
          desc: tRef.current("board.newCard.defaultDescription"),
          tags: [],
          direction: null,
          dueDate: null,
          blockedBy: [],
          order,
        });
        setModalModeRef.current("new");
      }
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }
    if (copilot === "1") {
      useCopilotStore.getState().setOpen(true);
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
    }
  }, [searchParamsKey, boardId, localeRoot]);

  useEffect(() => {
    const card = board.modalCard;
    if (!user?.id || board.modalMode !== "edit" || !card?.id) return;
    registerRecentCard(user.id, {
      boardId,
      boardName,
      cardId: card.id,
      title: card.title || card.id,
    });
  }, [user?.id, boardId, boardName, board.modalMode, board.modalCard?.id]);

  const anyConfirmOpen = Boolean(dailyDeleteConfirmId || board.csvImportConfirm);

  const addColumnDialogRef = useRef<HTMLDivElement | null>(null);
  const addColumnInputRef = useRef<HTMLInputElement | null>(null);
  useModalA11y({
    open: board.addColumnOpen,
    onClose: () => board.setAddColumnOpen(false),
    containerRef: addColumnDialogRef,
    initialFocusRef: addColumnInputRef,
  });

  const confirmDeleteDialogRef = useRef<HTMLDivElement | null>(null);
  const confirmDeleteCancelRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({
    open: Boolean(board.confirmDelete),
    onClose: () => board.setConfirmDelete(null),
    containerRef: confirmDeleteDialogRef,
    initialFocusRef: confirmDeleteCancelRef,
  });

  const dailyDialogRef = useRef<HTMLDivElement | null>(null);
  const dailyCloseRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({
    open: dailyOpen && !anyConfirmOpen,
    onClose: closeDailyModal,
    containerRef: dailyDialogRef,
    initialFocusRef: dailyCloseRef,
  });

  const updateDirection = useCallback((cardId: string, dir: string) => {
    useBoardStore.getState().updateDb((d) => {
      const c = d.cards.find((x) => x.id === cardId);
      if (!c) return;
      c.direction = c.direction === dir ? null : dir;
    });
  }, []);

  const onEditCardById = useCallback(
    (id: string) => {
      const c = useBoardStore.getState().db?.cards.find((x) => x.id === id);
      if (c) {
        board.setModalCard(c);
        board.setModalMode("edit");
      }
    },
    [board.setModalCard, board.setModalMode]
  );

  const onOpenDescById = useCallback(
    (id: string) => {
      const c = useBoardStore.getState().db?.cards.find((x) => x.id === id);
      if (c) board.setDescModalCard(c);
    },
    [board.setDescModalCard]
  );

  const onMergeDraftIntoExisting = useCallback(
    (targetCardId: string, payload: { title: string; description: string; tags: string[] }) => {
      const stamp = new Date().toISOString();
      updateDb((d) => {
        const c = d.cards.find((x) => x.id === targetCardId);
        if (!c) return;
        const block = [
          "",
          "---",
          `[Mesclado de novo card — ${stamp}]`,
          `**${payload.title}**`,
          "",
          payload.description,
        ].join("\n");
        c.desc = `${String(c.desc || "").trim()}\n${block}`.trim();
        const tagSet = new Set([...(c.tags || []), ...payload.tags]);
        c.tags = [...tagSet].map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
      });
      pushToast({ kind: "success", title: t("cardModal.duplicate.mergeToast") });
      board.setModalCard(null);
    },
    [updateDb, pushToast, t, board.setModalCard]
  );

  const overlayProps = {
    ...buildKanbanOverlayModel({
    t,
    boardId,
    boardName,
    getHeaders,
    priorities,
    progresses,
    directions,
    mapaProducao: db.mapaProducao,
    board,
    dailyOpen,
    addColumnDialogRef,
    addColumnInputRef,
    confirmDeleteDialogRef,
    confirmDeleteCancelRef,
    dailyDialogRef,
    dailyCloseRef,
  }),
    onOpenExistingCard: onEditCardById,
    onMergeDraftIntoExisting,
    onCardsBatchDeleted: () => clearSelectionRef.current?.(),
  };

  return (
    <>
      <div className="sticky top-[42px] z-[150] flex flex-col">
        <BoardNlqDock
          boardId={boardId}
          getHeaders={getHeaders}
          onExpandFilters={() => filters.setPriorityBarVisible(true)}
          boardView={boardView}
          setBoardView={setBoardView}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchInputRef={filters.searchInputRef}
        />
        <BoardMetricsStrip t={t} totalCards={board.cards.length} executionInsights={board.executionInsights} />
        {activeSprintBoard?.status === "active" ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-2 sm:px-5 lg:px-6">
            <span className="text-[11px] font-semibold text-[var(--flux-text-muted)] truncate max-w-[min(100%,220px)]">
              {activeSprintBoard.name}
            </span>
            <button
              type="button"
              onClick={toggleSprintScopeOnly}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                sprintScopeOnly
                  ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                  : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
              }`}
            >
              {sprintScopeOnly ? t("board.filters.sprintAll") : t("board.filters.sprintOnly")}
            </button>
            <span className="text-[10px] text-[var(--flux-text-muted)] hidden sm:inline">{t("board.filters.sprintFilterHint")}</span>
          </div>
        ) : null}
      </div>

      {/* Hidden file input for CSV import — triggered from the header via the board-store bridge */}
      <input
        ref={(el) => registerCsvImportInput(el)}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={board.handleImportCSV}
      />

      <BoardCardSelectionProvider buckets={board.buckets} visibleCardsByBucket={filters.visibleCardsByBucket}>
        <SelectionClearBridge clearRef={clearSelectionRef} />
        <KanbanBatchToolbarBound
          boardView={boardView}
          t={t}
          moveCardsBatch={board.moveCardsBatch}
          getCardsByBucket={filters.getCardsByBucket}
          buckets={board.buckets}
          priorities={priorities}
          patchCardFromTable={board.patchCardFromTable}
          setConfirmDelete={board.setConfirmDelete}
        />
        <KanbanBoardCanvas
          t={t}
          boardScrollRef={board.boardScrollRef}
          boardView={boardView}
          priorityBarVisible={filters.priorityBarVisible}
          isPanning={board.isPanning}
          onPanPointerDown={board.handlePanPointerDown}
          onPanPointerMove={board.handlePanPointerMove}
          onPanPointerUp={board.endPan}
          onPanPointerCancel={board.endPan}
          cards={board.cards}
          buckets={board.buckets}
          collapsed={board.collapsed}
          directions={directions}
          filterCard={filters.filterCard}
          visibleCardsByBucket={filters.visibleCardsByBucket}
          onTimelineDueDate={board.handleTimelineDueDate}
          onTimelineOpenCard={board.handleTimelineOpenCard}
          priorities={priorities}
          onPatchCardFromTable={board.patchCardFromTable}
          onTableOpenCard={board.handleTimelineOpenCard}
          sensors={dnd.sensors}
          collisionDetection={dnd.collisionDetection}
          onDragStart={dnd.handleDragStart}
          onDragEnd={handleKanbanDragEnd}
          activeCard={dnd.activeCard}
          activeDragCount={dnd.activeDragCount}
          activeDragIds={dnd.activeDragIds}
          onToggleCollapse={board.toggleCollapsed}
          onAddCard={(bucketKey) => {
            board.setModalCard({
              id: "",
              bucket: bucketKey,
              priority: "Média",
              progress: "Não iniciado",
              title: "",
              desc: t("board.newCard.defaultDescription"),
              tags: [],
              direction: null,
              dueDate: null,
              blockedBy: [],
              order: filters.getCardsByBucket(bucketKey).length,
            });
            board.setModalMode("new");
          }}
          onEditCard={onEditCardById}
          onDeleteCard={(id) => board.setConfirmDelete({ type: "card", id, label: "" })}
          onRenameColumn={(b) => {
            board.setEditingColumnKey(b.key);
            board.setNewColumnName(b.label);
            board.setAddColumnOpen(true);
          }}
          onDeleteColumn={
            board.buckets.length > 1
              ? (key) =>
                  board.setConfirmDelete({
                    type: "bucket",
                    id: key,
                    label: board.buckets.find((x) => x.key === key)?.label || "",
                  })
              : undefined
          }
          onSetDirection={updateDirection}
          onOpenDesc={onOpenDescById}
          onOpenAddColumn={() => {
            board.setEditingColumnKey(null);
            board.setNewColumnName("");
            board.setAddColumnOpen(true);
          }}
          onPatchCard={board.patchCardFromTable}
          onDuplicateCard={board.duplicateCard}
          onVisibleColumnKeyChange={onVisibleColumnKeyChange}
        />

        <BoardExecutionInsightsPanel
          executionInsights={board.executionInsights}
          t={t}
          onOpenCard={(card) => {
            board.setModalCard(card);
            board.setModalMode("edit");
          }}
        />

        <DailyIaFab onOpen={openDailyModal} />

        <BoardSummaryDock
        t={t}
        buckets={board.buckets}
        visibleCardsByBucket={filters.visibleCardsByBucket}
        cards={board.cards}
        directions={directions}
        directionCounts={board.directionCounts}
        totalWithDir={board.totalWithDir}
        okrObjectivesLength={board.okrObjectives.length}
        okrLoadError={board.okrLoadError}
        okrProjectionError={board.okrProjectionError}
        currentQuarter={board.currentQuarter}
        okrsComputed={board.okrsComputed}
        okrProjectionByKrId={board.okrProjectionByKrId}
        />

        <KanbanBoardOverlays {...overlayProps} />
      </BoardCardSelectionProvider>
    </>
  );
}

export function KanbanBoard(props: KanbanBoardProps) {
  const db = useBoardStore((s) => s.db);
  if (!db) return null;
  return (
    <Suspense fallback={<SkeletonKanbanBoard />}>
      <KanbanBoardLoaded {...props} />
    </Suspense>
  );
}
