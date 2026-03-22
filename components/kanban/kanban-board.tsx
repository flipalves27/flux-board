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
import { registerBoardDesktopDailyOpener } from "@/lib/board-desktop-daily-bridge";
import { registerRecentCard } from "@/lib/recent-cards";
import { useToast } from "@/context/toast-context";
import { useBoardNlqUiStore } from "@/stores/board-nlq-ui-store";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useTranslations } from "next-intl";
import { useBoardPersistence } from "./hooks/useBoardPersistence";
import { useBoardFilters } from "./hooks/useBoardFilters";
import { apiGet, ApiError } from "@/lib/api-client";
import { useSprintStore } from "@/stores/sprint-store";
import { useCeremonyStore } from "@/stores/ceremony-store";
import type { SprintData } from "@/lib/schemas";
import { useBoardState } from "./hooks/useBoardState";
import { useBoardRealtime } from "./hooks/useBoardRealtime";
import { useBoardDnd } from "./hooks/useBoardDnd";
import { BoardNlqDock } from "./board-nlq-dock";
import { BoardIntelligenceRow } from "./board-intelligence-row";
import { BoardFlowHealthPanel } from "./board-flow-health-panel";
import { BoardSprintCoachPanel } from "./board-sprint-coach-panel";
import { buildFlowInsightChips } from "@/lib/board-flow-insights";
import { computeBoardPortfolio } from "@/lib/board-portfolio-metrics";
import { KanbanBoardCanvas } from "./kanban-board-canvas";
import { BoardCardSelectionProvider, useBoardCardSelection } from "./board-card-selection-context";
import { KanbanBatchSelectionBar } from "./kanban-batch-selection-bar";
import { BoardSummaryDock } from "./board-summary-dock";
import { BoardExecutionInsightsPanel } from "./board-execution-insights-panel";
import { BoardMobileToolHub } from "./board-mobile-tool-hub";
import { KanbanBoardOverlays } from "./kanban-board-overlays";
import { buildKanbanOverlayModel } from "./kanban-overlay-model";
import { SkeletonKanbanBoard } from "@/components/skeletons/flux-skeletons";

function SelectionClearBridge({ clearRef }: { clearRef: React.MutableRefObject<(() => void) | null> }) {
  const { clearSelection } = useBoardCardSelection();
  clearRef.current = clearSelection;
  return null;
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
  const { selectedIds, clearSelection, getOrderedSelectionIds } = useBoardCardSelection();
  if (boardView !== "kanban") return null;
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
    insightFocusCardIds,
    setInsightFocusCardIds,
    clearInsightFocus,
  } = persistence;

  const [flowHealthOpen, setFlowHealthOpen] = useState(false);
  const [sprintCoachOpen, setSprintCoachOpen] = useState(false);

  const nlqIdsArr = useBoardNlqUiStore((s) => s.allowedIdsByBoard[boardId]);
  const nlqAllowedIds = useMemo(() => {
    if (!nlqIdsArr) return null;
    return new Set(nlqIdsArr);
  }, [nlqIdsArr]);

  const setActiveSprintBoard = useSprintStore((s) => s.setActiveSprint);
  const setSprintsBoard = useSprintStore((s) => s.setSprints);
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
        const data = await apiGet<{ sprints: SprintData[] }>(
          `/api/boards/${encodeURIComponent(boardId)}/sprints`,
          getHeaders()
        );
        if (cancelled) return;
        const list = Array.isArray(data.sprints) ? data.sprints : [];
        setSprintsBoard(boardId, list);
        setActiveSprintBoard(boardId, list.find((s) => s.status === "active") ?? null);
      } catch (e) {
        if (cancelled) return;
        setSprintsBoard(boardId, []);
        setActiveSprintBoard(boardId, null);
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, getHeaders, setActiveSprintBoard, setSprintsBoard]);

  const sprintCardIdSet = useMemo(() => {
    if (!sprintScopeOnly) return null;
    if (!activeSprintBoard || activeSprintBoard.status !== "active") return null;
    const ids = activeSprintBoard.cardIds ?? [];
    return new Set(ids);
  }, [sprintScopeOnly, activeSprintBoard]);

  const sprintProgress = useMemo(() => {
    if (!activeSprintBoard || activeSprintBoard.status !== "active") return null;
    const total = activeSprintBoard.cardIds?.length ?? 0;
    if (total === 0) return { done: 0, total: 0, pct: 0 };
    const done = activeSprintBoard.doneCardIds?.length ?? 0;
    return { done, total, pct: Math.round((done / total) * 100) };
  }, [activeSprintBoard]);

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
    insightFocusCardIds: insightFocusCardIds.size > 0 ? insightFocusCardIds : null,
    clearInsightFocus,
  });

  const portfolioSnapshot = useMemo(
    () =>
      computeBoardPortfolio({
        cards: board.cards,
        config: { bucketOrder: board.buckets },
        lastUpdated: db.lastUpdated,
      }),
    [board.cards, board.buckets, db.lastUpdated]
  );

  const flowChips = useMemo(
    () => buildFlowInsightChips({ cards: board.cards, buckets: board.buckets, lastUpdated: db.lastUpdated }),
    [board.cards, board.buckets, db.lastUpdated]
  );

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

  useEffect(() => {
    registerBoardDesktopDailyOpener(openDailyModal);
    return () => registerBoardDesktopDailyOpener(null);
  }, [openDailyModal]);

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
    const q = new URLSearchParams(searchParamsKey);
    const cardId = q.get("card");
    const newCard = q.get("newCard");
    const copilot = q.get("copilot");
    const flowHealth = q.get("flowHealth");
    const sprintPanel = q.get("sprintPanel");
    const sprintCoach = q.get("sprintCoach");
    const standup = q.get("standup");

    const hasDeepLink =
      Boolean(cardId) ||
      newCard === "1" ||
      copilot === "1" ||
      flowHealth === "1" ||
      sprintPanel === "1" ||
      sprintCoach === "1" ||
      standup === "1";

    if (!hasDeepLink) {
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
      return;
    }
    if (flowHealth === "1") {
      setFlowHealthOpen(true);
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }
    if (sprintPanel === "1") {
      useSprintStore.getState().setPanelOpen(boardId);
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }
    if (sprintCoach === "1") {
      setSprintCoachOpen(true);
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }
    if (standup === "1") {
      const sp = useSprintStore.getState().activeSprint[boardId];
      if (sp?.id) {
        useCeremonyStore.getState().openStandup(boardId, sp.id);
      }
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
      <div className="sticky top-[42px] z-[var(--flux-z-board-sticky-chrome)] flex flex-col">
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
        <BoardIntelligenceRow
          tKanban={t}
          totalCards={board.cards.length}
          executionInsights={board.executionInsights}
          portfolio={portfolioSnapshot}
          chips={flowChips}
          insightFocusActive={insightFocusCardIds.size > 0}
          onInsightChip={(ids) => setInsightFocusCardIds(ids)}
          onClearInsightFocus={clearInsightFocus}
          onOpenFlowHealth={() => setFlowHealthOpen(true)}
          onOpenCopilot={() => useCopilotStore.getState().setOpen(true)}
          onOpenSprintCoach={() => setSprintCoachOpen(true)}
          sprintCoachVisible={activeSprintBoard?.status === "active"}
        />
        {activeSprintBoard?.status === "active" ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-2 sm:px-5 lg:px-6">
            {sprintProgress && sprintProgress.total > 0 ? (
              <div
                className="relative h-9 w-9 shrink-0"
                title={t("board.filters.sprintProgress", { done: sprintProgress.done, total: sprintProgress.total })}
              >
                <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="var(--flux-chrome-alpha-12)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke={sprintProgress.pct === 100 ? "var(--flux-success)" : "var(--flux-primary)"}
                    strokeWidth="3"
                    strokeDasharray={`${(sprintProgress.pct / 100) * 97.4} 97.4`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-[var(--flux-text-muted)]">
                  {sprintProgress.pct}%
                </span>
              </div>
            ) : null}
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
          onPinCardToTop={board.pinCardToTop}
          onVisibleColumnKeyChange={onVisibleColumnKeyChange}
          sprintBoardQuickActions={{ boardId, getHeaders }}
        />

        <BoardExecutionInsightsPanel
          executionInsights={board.executionInsights}
          t={t}
          hideDesktopFab
          onOpenCard={(card) => {
            board.setModalCard(card);
            board.setModalMode("edit");
          }}
        />

        <BoardMobileToolHub onOpenDaily={openDailyModal} />

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

      <BoardFlowHealthPanel
        open={flowHealthOpen}
        onClose={() => setFlowHealthOpen(false)}
        boardId={boardId}
        cards={board.cards}
        buckets={board.buckets}
        lastUpdated={db.lastUpdated}
        getHeaders={getHeaders}
        onOpenCard={(id) => {
          const c = useBoardStore.getState().db?.cards.find((x) => x.id === id);
          if (c) {
            board.setModalCard(c);
            board.setModalMode("edit");
          }
        }}
      />

      <BoardSprintCoachPanel
        open={sprintCoachOpen}
        onClose={() => setSprintCoachOpen(false)}
        boardId={boardId}
        sprint={activeSprintBoard?.status === "active" ? activeSprintBoard : null}
        getHeaders={getHeaders}
      />
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
