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
import { BoardFilterBar, BoardPriorityButtons } from "./board-filter-bar";
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
import { WipOverrideModal } from "./wip-override-modal";
import { buildKanbanOverlayModel } from "./kanban-overlay-model";
import { resolveDoneBucketKeys } from "@/lib/board-scrum";
import { isLeanSixSigmaMethodology, isScrumMethodology } from "@/lib/board-methodology";
import { BoardProductGoalStrip } from "./board-product-goal-strip";
import { BoardScrumSettingsModal } from "./board-scrum-settings-modal";
import { BoardIncrementReviewModal } from "./board-increment-review-modal";
import { BoardKanbanCadencePanel } from "./board-kanban-cadence-panel";
import { BoardLssAssistPanel } from "./board-lss-assist-panel";
import { BoardLssContextStrip } from "./board-lss-context-strip";
import { BoardKnowledgeGraphPanel } from "./board-knowledge-graph-panel";
import { BoardWorkloadPanel } from "./board-workload-panel";
import { BoardFocusModeBar } from "./board-focus-mode-bar";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { BoardAutomationSuggestions } from "./board-automation-suggestions";
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
  priorities,
  progresses,
  directions,
  productTourExpandFilters,
  allowExternalMerge = true,
}: KanbanBoardProps) {
  const t = useTranslations("kanban");
  const tView = useTranslations("kanban.board.timeline");
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
  const [scrumSettingsOpen, setScrumSettingsOpen] = useState(false);
  const [incrementReviewOpen, setIncrementReviewOpen] = useState(false);
  const [kanbanCadenceOpen, setKanbanCadenceOpen] = useState(false);
  const [workloadBalanceOpen, setWorkloadBalanceOpen] = useState(false);
  const [knowledgeGraphOpen, setKnowledgeGraphOpen] = useState(false);
  const [lssAssistOpen, setLssAssistOpen] = useState(false);
  const [matrixWeightFilter, setMatrixWeightFilter] = useState<
    "all" | "critical_high" | "high_plus" | "medium_plus" | "critical"
  >("all");

  const [focusMode, setFocusMode] = useState(false);

  const toggleFocusMode = useCallback(() => setFocusMode((p) => !p), []);

  const [intelligenceExpanded, setIntelligenceExpanded] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("flux-board.intelligence-row.expanded");
      if (v === "true") setIntelligenceExpanded(true);
    } catch { /* ignore */ }
  }, []);
  const toggleIntelligenceExpanded = useCallback(() => {
    setIntelligenceExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem("flux-board.intelligence-row.expanded", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const [nlqExpanded, setNlqExpanded] = useState(false);

  const methodology = db.boardMethodology ?? "scrum";

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
    matrixWeightFilter,
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
  const { searchInputRef } = filters;

  const boardHotkeyBindings = useMemo(() => {
    const p = hotkeyPatterns;
    const m: Record<string, (e: KeyboardEvent) => void> = {};
    m[p["board.newCard"]] = (e) => {
      e.preventDefault();
      routerRef.current.push(`${localeRoot}/board/${boardId}?newCard=1`);
    };
    m[p["board.focusSearch"]] = (e) => {
      e.preventDefault();
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    };
    m[p["board.focusMode"]] = (e) => {
      e.preventDefault();
      setFocusMode((prev) => !prev);
    };
    return m;
  }, [boardId, hotkeyPatterns, localeRoot, searchInputRef]);

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
    const scrumSettings = q.get("scrumSettings");
    const incrementReview = q.get("incrementReview");
    const kanbanCadence = q.get("kanbanCadence");
    const lssAssist = q.get("lssAssist");

    const hasDeepLink =
      Boolean(cardId) ||
      newCard === "1" ||
      copilot === "1" ||
      flowHealth === "1" ||
      sprintPanel === "1" ||
      sprintCoach === "1" ||
      standup === "1" ||
      scrumSettings === "1" ||
      incrementReview === "1" ||
      kanbanCadence === "1" ||
      lssAssist === "1";

    if (!hasDeepLink) {
      handledQueryRef.current = null;
      return;
    }

    const queryKey = `${boardId}|${searchParamsKey}`;
    if (handledQueryRef.current === queryKey) return;
    handledQueryRef.current = queryKey;

    const scrumOnlyDeepLink =
      sprintPanel === "1" ||
      sprintCoach === "1" ||
      standup === "1" ||
      incrementReview === "1";
    if (methodology !== "scrum" && scrumOnlyDeepLink) {
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }

    if (methodology !== "kanban" && kanbanCadence === "1") {
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }

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
      return;
    }
    if (scrumSettings === "1") {
      setScrumSettingsOpen(true);
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }
    if (incrementReview === "1") {
      setIncrementReviewOpen(true);
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }
    if (kanbanCadence === "1") {
      setKanbanCadenceOpen(true);
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }
    if (lssAssist === "1") {
      if (isLeanSixSigmaMethodology(methodology)) {
        setLssAssistOpen(true);
      }
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
    }
  }, [searchParamsKey, boardId, localeRoot, methodology]);

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
    definitionOfDone: db.config.definitionOfDone,
    doneBucketKeys: resolveDoneBucketKeys(
      db.config.bucketOrder,
      db.config.definitionOfDone?.doneBucketKeys ?? null
    ),
    boardMethodology: methodology,
    board,
    dailyOpen,
    openCardById: onEditCardById,
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
      {focusMode && <BoardFocusModeBar onExit={toggleFocusMode} />}

      {!focusMode && (
      <div className="sticky top-[min(6.5rem,calc(env(safe-area-inset-top,0px)+5.25rem))] md:top-[42px] z-[var(--flux-z-board-sticky-chrome)] flex flex-col bg-[var(--flux-surface-dark)]/95 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
        <BoardAutomationSuggestions
          variant="topStrip"
          boardId={boardId}
          cards={board.cards}
          buckets={board.buckets}
        />
        {/* --- NLQ Dock: compact / expanded -------------------------------- */}
        {nlqExpanded ? (
          <div className="relative">
            <BoardNlqDock
              boardId={boardId}
              getHeaders={getHeaders}
              boardView={boardView}
              setBoardView={setBoardView}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchInputRef={filters.searchInputRef}
            />
            <button
              type="button"
              onClick={() => setNlqExpanded(false)}
              className="absolute right-3 top-2 rounded-md p-1 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
              aria-label={t("board.nlqCompact.collapse")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 15l-6-6-6 6" /></svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-06)] px-4 py-1.5 sm:px-5 lg:px-6">
            <div
              className="board-segment flex items-center gap-0.5 p-1 shrink-0 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-08)]"
              role="group"
              aria-label={t("board.timeline.toggleGroupAria")}
            >
              {(
                [
                  ["kanban", "K", "viewKanbanTooltip", "viewKanbanAria"],
                  ["table", "T", "viewTableTooltip", "viewTableAria"],
                  ["timeline", "TL", "viewTimelineTooltip", "viewTimelineAria"],
                  ["eisenhower", "E", "viewEisenhowerTooltip", "viewEisenhowerAria"],
                ] as const
              ).map(([v, label, tooltipKey, ariaKey]) => (
                <CustomTooltip key={v} content={tView(tooltipKey)} position="bottom">
                  <button
                    type="button"
                    onClick={() => setBoardView(v)}
                    className={`px-2 py-1.5 rounded-md transition-all duration-200 flex items-center justify-center ${
                      boardView === v
                        ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_8px_var(--flux-primary-alpha-35)]"
                        : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
                    }`}
                    aria-pressed={boardView === v}
                    aria-label={tView(ariaKey)}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
                  </button>
                </CustomTooltip>
              ))}
            </div>

            {/* Sprint badge (inline) */}
            {isScrumMethodology(methodology) && activeSprintBoard?.status === "active" && sprintProgress && sprintProgress.total > 0 ? (
              <button
                type="button"
                onClick={toggleSprintScopeOnly}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors shrink-0 ${
                  sprintScopeOnly
                    ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                    : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
                }`}
                title={t("board.filters.sprintProgress", { done: sprintProgress.done, total: sprintProgress.total })}
              >
                <svg viewBox="0 0 36 36" className="h-5 w-5 -rotate-90 shrink-0" aria-hidden>
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--flux-chrome-alpha-12)" strokeWidth="3.5" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none"
                    stroke={sprintProgress.pct === 100 ? "var(--flux-success)" : "var(--flux-primary)"}
                    strokeWidth="3.5"
                    strokeDasharray={`${(sprintProgress.pct / 100) * 97.4} 97.4`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="tabular-nums">{sprintProgress.pct}%</span>
                <span className="truncate max-w-[100px] hidden sm:inline">{activeSprintBoard.name}</span>
              </button>
            ) : null}

            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              <BoardPriorityButtons boardId={boardId} />
            </div>

            <button
              type="button"
              onClick={() => setNlqExpanded(true)}
              className="ml-auto rounded-md border border-[var(--flux-chrome-alpha-12)] p-1.5 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:border-[var(--flux-primary-alpha-35)] transition-colors"
              aria-label={t("board.nlqCompact.expand")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            </button>

            <div className="relative shrink-0 w-[min(100%,180px)] sm:w-[200px]">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--flux-text-muted)] opacity-50 text-xs select-none" aria-hidden>⌕</span>
              <input
                ref={filters.searchInputRef}
                data-flux-board-search
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar…"
                className="w-full pl-7 pr-2 py-1 rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] text-[11px] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[var(--flux-primary-alpha-20)] outline-none transition-all duration-200"
              />
            </div>
          </div>
        )}

        <BoardFilterBar boardId={boardId} hidePriorities />

        {/* --- Intelligence Row: collapsible ------------------------------- */}
        {intelligenceExpanded ? (
          <div className="relative">
            <BoardIntelligenceRow
              portfolio={portfolioSnapshot}
              chips={flowChips}
              insightFocusActive={insightFocusCardIds.size > 0}
              onInsightChip={(ids) => setInsightFocusCardIds(ids)}
              onClearInsightFocus={clearInsightFocus}
              onOpenFlowHealth={() => setFlowHealthOpen(true)}
              onOpenSprintCoach={() => setSprintCoachOpen(true)}
              sprintCoachVisible={isScrumMethodology(methodology) && activeSprintBoard?.status === "active"}
              onOpenCadence={() => setKanbanCadenceOpen(true)}
              cadenceVisible={methodology === "kanban"}
              boardId={boardId}
              getHeaders={getHeaders}
              onOpenWorkloadBalance={() => setWorkloadBalanceOpen(true)}
              onOpenKnowledgeGraph={() => setKnowledgeGraphOpen(true)}
            />
            <button
              type="button"
              onClick={toggleIntelligenceExpanded}
              className="absolute right-3 top-1.5 rounded-md p-1 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
              aria-label={t("board.intelligenceCollapse.collapse")}
              aria-expanded
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 15l-6-6-6 6" /></svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-1 sm:px-5 lg:px-6">
            <button
              type="button"
              onClick={toggleIntelligenceExpanded}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
              aria-expanded={false}
              aria-label={t("board.intelligenceCollapse.expand")}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
              <span>{t("board.intelligenceCollapse.label")}</span>
            </button>
            <span className="text-[10px] tabular-nums text-[var(--flux-text-muted)]">
              WIP {board.executionInsights.inProgress}
            </span>
            {flowChips.find((c) => c.kind === "blocked") ? (
              <span className="text-[10px] tabular-nums text-[var(--flux-warning,#f59e0b)]">
                {flowChips.find((c) => c.kind === "blocked")?.values?.count ?? 0} blocked
              </span>
            ) : null}
            {portfolioSnapshot.risco !== null ? (
              <span className="text-[10px] tabular-nums text-[var(--flux-text-muted)]">
                {t("board.intelligence.riskShort", { n: portfolioSnapshot.risco })}
              </span>
            ) : null}
          </div>
        )}

        {isScrumMethodology(methodology) ? (
          <BoardProductGoalStrip
            boardId={boardId}
            getHeaders={getHeaders}
            onOpenScrumSettings={() => setScrumSettingsOpen(true)}
            onOpenIncrementReview={() => setIncrementReviewOpen(true)}
          />
        ) : null}

        {isLeanSixSigmaMethodology(methodology) ? (
          <BoardLssContextStrip
            buckets={board.buckets}
            cards={board.cards}
            onOpenAssist={() => setLssAssistOpen(true)}
          />
        ) : null}

        {/* Sprint bar: only shows as full row when NLQ dock is expanded (compact badge handles it otherwise) */}
        {nlqExpanded && isScrumMethodology(methodology) && activeSprintBoard?.status === "active" ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-2 sm:px-5 lg:px-6">
            {sprintProgress && sprintProgress.total > 0 ? (
              <div
                className="relative h-9 w-9 shrink-0"
                title={t("board.filters.sprintProgress", { done: sprintProgress.done, total: sprintProgress.total })}
              >
                <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--flux-chrome-alpha-12)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none"
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

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-2 sm:px-5 lg:px-6">
          <span className="text-[11px] font-semibold text-[var(--flux-text-muted)]">{t("board.filters.matrixWeightLabel")}</span>
          {(
            [
              { key: "all", label: t("board.filters.matrixWeightAll") },
              { key: "critical_high", label: t("board.filters.matrixWeightCriticalHigh") },
              { key: "high_plus", label: t("board.filters.matrixWeightHighPlus") },
              { key: "medium_plus", label: t("board.filters.matrixWeightMediumPlus") },
              { key: "critical", label: t("board.filters.matrixWeightCriticalOnly") },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMatrixWeightFilter(opt.key)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                matrixWeightFilter === opt.key
                  ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                  : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      )}

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
          sprintBoardQuickActions={isScrumMethodology(methodology) ? { boardId, getHeaders } : undefined}
          getHeaders={getHeaders}
          onAddCardFromTemplate={(bucketKey, tpl) => {
            board.setModalCard({
              id: "",
              bucket: bucketKey,
              priority: tpl.priority || "Média",
              progress: "Não iniciado",
              title: tpl.title,
              desc: tpl.description || t("board.newCard.defaultDescription"),
              tags: tpl.tags ?? [],
              direction: null,
              dueDate: null,
              blockedBy: [],
              order: filters.getCardsByBucket(bucketKey).length,
            });
            board.setModalMode("new");
          }}
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

        <WipOverrideModal
          pending={board.wipOverridePending}
          onConfirm={board.confirmWipOverride}
          onClose={board.dismissWipOverride}
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

      <BoardScrumSettingsModal open={scrumSettingsOpen} onClose={() => setScrumSettingsOpen(false)} />
      <BoardLssAssistPanel
        open={lssAssistOpen}
        onClose={() => setLssAssistOpen(false)}
        boardId={boardId}
        getHeaders={getHeaders}
      />
      <BoardIncrementReviewModal
        open={incrementReviewOpen}
        onClose={() => setIncrementReviewOpen(false)}
        boardId={boardId}
        activeSprint={activeSprintBoard?.status === "active" ? activeSprintBoard : null}
      />

      <BoardKanbanCadencePanel
        open={kanbanCadenceOpen}
        onClose={() => setKanbanCadenceOpen(false)}
        boardId={boardId}
        boardLabel={boardName}
        getHeaders={getHeaders}
      />

      <BoardKnowledgeGraphPanel
        boardId={boardId}
        open={knowledgeGraphOpen}
        onClose={() => setKnowledgeGraphOpen(false)}
      />

      <BoardWorkloadPanel
        boardId={boardId}
        open={workloadBalanceOpen}
        onClose={() => setWorkloadBalanceOpen(false)}
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
