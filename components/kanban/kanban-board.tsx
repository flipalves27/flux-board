"use client";

import "@/components/kanban/kanban-card-globals.css";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { resolveHotkeyPatterns } from "@/lib/hotkeys/custom-bindings";
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
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
import { useKanbanUiStore } from "@/stores/ui-store";
import { parseExecFilterParam, parseViewParam } from "@/lib/build-c-level-board-query";
import { useBoardFilters } from "./hooks/useBoardFilters";
import { useSprintStore } from "@/stores/sprint-store";
import { useCeremonyStore } from "@/stores/ceremony-store";
import { useBoardState } from "./hooks/useBoardState";
import { useBoardRealtime } from "./hooks/useBoardRealtime";
import { useBoardDnd } from "./hooks/useBoardDnd";
import { BoardChromeSticky } from "./board-chrome-sticky";
import { BoardBacklogPrioritizeDrawer } from "@/components/board/board-backlog-prioritize-drawer";
import { FilterModal } from "./filter-modal";
import { useOnda4Flags } from "@/components/fluxy/use-onda4-flags";
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
import { buildDragMoveFieldsFromOverId } from "./kanban-dnd-utils";
import { resolveDoneBucketKeys } from "@/lib/board-scrum";
import { buildHistoricalCycleDaysFromCards } from "@/lib/board-historical-cycle-days";
import {
  isLeanSixSigmaMethodology,
  isSprintMethodology,
  type BoardMethodology,
} from "@/lib/board-methodology";
import { clampExecutiveProductGoal, clampExecutiveStakeholderNote } from "@/lib/executive-board-config";
import { getMethodologyModule } from "@/lib/methodology-module";
import { strategyToInitiative } from "@/lib/swot-intelligence";
import type { SwotTowsStrategy } from "@/lib/template-types";
import { BoardScrumSettingsModal } from "./board-scrum-settings-modal";
import { BoardIncrementReviewModal } from "./board-increment-review-modal";
import { BoardKanbanCadencePanel } from "./board-kanban-cadence-panel";
import { BoardLssAssistPanel } from "./board-lss-assist-panel";
import { BoardSafeAssistPanel } from "./board-safe-assist-panel";
import type { BoardViewMode } from "./kanban-constants";
import { BoardKnowledgeGraphPanel } from "./board-knowledge-graph-panel";
import { BoardWorkloadPanel } from "./board-workload-panel";
import { BoardFocusModeBar } from "./board-focus-mode-bar";
import { BoardActiveSprintContext } from "./board-active-sprint-context";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
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
  /**
   * Alterar colunas, WIP, política, reordenar colunas, override de WIP — só com papel admin do board
   * (dono, admin de org, ou membro com admin). Vem de `GET .../bootstrap` (`viewerCapabilities.canAdmin`).
   */
  canAdminBoard?: boolean;
  /** Expande filtros para o passo do tour (Daily Insights). */
  productTourExpandFilters?: boolean;
  /** Quando false, polling remoto não sobrescreve o board (ex.: salvando). */
  allowExternalMerge?: boolean;
  /** Bootstrap completo do board (ex.: após IA alterar cards no servidor). */
  reloadBoardFromServer?: () => Promise<void>;
}

function KanbanBoardLoaded({
  boardName,
  boardId,
  getHeaders,
  priorities,
  progresses,
  directions,
  productTourExpandFilters,
  canAdminBoard = true,
  allowExternalMerge = true,
  reloadBoardFromServer,
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
  const onda4 = useOnda4Flags();
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
    executivePresentationFilter,
    setExecutivePresentationFilter,
    activePrio,
    setActivePrio,
    activeLabels,
    setActiveLabels,
    searchQuery,
    setSearchQuery,
    matrixWeightFilter,
    setMatrixWeightFilter,
    sprintScopeOnly,
    setSprintScopeOnly,
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
  const [safeAssistOpen, setSafeAssistOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [backlogPrioritizeOpen, setBacklogPrioritizeOpen] = useState(false);
  const [openingCardId, setOpeningCardId] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const [focusMode, setFocusMode] = useState(false);

  const toggleFocusMode = useCallback(() => setFocusMode((p) => !p), []);
  useEffect(() => {
    const onToggle = () => setFocusMode((p) => !p);
    window.addEventListener("flux-toggle-board-focus-mode", onToggle as EventListener);
    return () => window.removeEventListener("flux-toggle-board-focus-mode", onToggle as EventListener);
  }, []);

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

  const [detailChromeExpanded, setDetailChromeExpanded] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem("flux-board.board-detail-chrome.expanded");
      if (v === "false") setDetailChromeExpanded(false);
    } catch {
      /* ignore */
    }
  }, []);
  const toggleDetailChromeExpanded = useCallback(() => {
    setDetailChromeExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("flux-board.board-detail-chrome.expanded", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const [nlqExpanded, setNlqExpanded] = useState(false);

  useEffect(() => {
    if (onda4.enabled && onda4.omnibar) setNlqExpanded(false);
  }, [onda4.enabled, onda4.omnibar]);

  const methodology = db.boardMethodology ?? "scrum";
  const methodologyModule = useMemo(
    () => getMethodologyModule(methodology as BoardMethodology),
    [methodology]
  );
  const isSwotBoard = db.config?.strategyTemplateKind === "swot";
  const allowedBoardViewModes = useMemo(() => {
    const base = methodologyModule.allowedViewModes.filter((mode) => mode !== "swot");
    return isSwotBoard ? [...base, "swot" as const] : base;
  }, [isSwotBoard, methodologyModule.allowedViewModes]);

  const saveExecutiveProductGoal = useCallback(
    (value: string) => {
      const g = clampExecutiveProductGoal(value);
      updateDb((d) => {
        if (g) d.config.productGoal = g;
        else delete d.config.productGoal;
      });
    },
    [updateDb]
  );

  const saveExecutiveStakeholderNote = useCallback(
    (value: string) => {
      const n = clampExecutiveStakeholderNote(value);
      updateDb((d) => {
        if (n) d.config.executiveStakeholderNote = n;
        else delete d.config.executiveStakeholderNote;
      });
    },
    [updateDb]
  );

  useEffect(() => {
    const allowed = allowedBoardViewModes;
    if (!allowed.includes(boardView as BoardViewMode)) {
      setBoardView(allowed[0] ?? "kanban");
    }
  }, [allowedBoardViewModes, boardView, setBoardView]);

  const matrixWeightOptions = useMemo(
    () =>
      [
        { key: "all" as const, label: t("board.filters.matrixWeightAll") },
        { key: "critical_high" as const, label: t("board.filters.matrixWeightCriticalHigh") },
        { key: "high_plus" as const, label: t("board.filters.matrixWeightHighPlus") },
        { key: "medium_plus" as const, label: t("board.filters.matrixWeightMediumPlus") },
        { key: "critical" as const, label: t("board.filters.matrixWeightCriticalOnly") },
      ],
    [t]
  );

  const nlqIdsArr = useBoardNlqUiStore((s) => s.allowedIdsByBoard[boardId]);
  const nlqAllowedIds = useMemo(() => {
    if (!nlqIdsArr) return null;
    return new Set(nlqIdsArr);
  }, [nlqIdsArr]);

  const activeSprintBoard = useSprintStore((s) => s.activeSprint[boardId] ?? null);
  const filterSearchInputRef = useRef<HTMLInputElement | null>(null);

  /** Sprints vêm de `GET /api/boards/[id]/bootstrap` no `loadBoard` da página (evita segundo round-trip). */

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
    setSprintScopeOnly((prev) => !prev);
  }, [setSprintScopeOnly]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPrefersReducedMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const board = useBoardState({
    boardId,
    getHeaders,
    priorities,
    progresses,
    directions,
    canAdminBoard,
    onAfterCardBucketsChange: collab.notifyBucketsChanged,
    onAfterColumnReorder: collab.notifyColumnReorder,
  });

  const { setModalCard, setModalMode, setDescModalCard, modalCard, modalMode } = board;

  const onBoardReloaded = useCallback(
    async (cardId: string) => {
      if (!reloadBoardFromServer) return;
      await reloadBoardFromServer();
      const fresh = useBoardStore.getState().db?.cards.find((c) => c.id === cardId);
      if (fresh) setModalCard(fresh);
    },
    [reloadBoardFromServer, setModalCard]
  );

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

  const doneBucketKeys = useMemo(
    () =>
      resolveDoneBucketKeys(
        db.config.bucketOrder,
        db.config.definitionOfDone?.doneBucketKeys ?? null
      ),
    [db.config.bucketOrder, db.config.definitionOfDone?.doneBucketKeys]
  );

  const historicalCycleDays = useMemo(
    () => buildHistoricalCycleDaysFromCards(board.cards),
    [board.cards]
  );

  const hotkeyPatterns = useMemo(() => resolveHotkeyPatterns(), []);

  const boardHotkeyBindings = useMemo(() => {
    const p = hotkeyPatterns;
    const m: Record<string, (e: KeyboardEvent) => void> = {};
    m[p["board.newCard"]] = (e) => {
      e.preventDefault();
      routerRef.current.push(`${localeRoot}/board/${boardId}?newCard=1`);
    };
    m[p["board.focusSearch"]] = (e) => {
      e.preventDefault();
      setFiltersOpen(true);
      requestAnimationFrame(() => filterSearchInputRef.current?.focus());
    };
    m[p["board.focusMode"]] = (e) => {
      e.preventDefault();
      setFocusMode((prev) => !prev);
    };
    if (onda4.enabled && onda4.omnibar) {
      m["/"] = (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("flux-open-fluxy-omnibar", { detail: {} }));
      };
    }
    return m;
  }, [boardId, hotkeyPatterns, localeRoot, onda4.enabled, onda4.omnibar]);

  useHotkeys(boardHotkeyBindings);

  const dnd = useBoardDnd({
    buckets: board.buckets,
    cards: board.cards,
    getCardsByBucket: filters.getCardsByBucket,
    moveCardsBatch: board.moveCardsBatch,
    reorderColumns: board.reorderColumns,
    canReorderColumns: canAdminBoard,
  });

  const clearSelectionRef = useRef<(() => void) | null>(null);

  const handleKanbanDragStart = useCallback(
    (e: DragStartEvent) => {
      dnd.handleDragStart(e);
      const idStr = String(e.active.id);
      if (!idStr.startsWith("card-")) return;
      const raw = e.active.data.current as { dragIds?: string[] } | undefined;
      const cardId = idStr.replace("card-", "");
      const ids = raw?.dragIds?.length ? raw.dragIds : [cardId];
      collab.notifyDragStart(ids);
    },
    [dnd, collab]
  );

  const handleKanbanDragMove = useCallback(
    (e: DragMoveEvent) => {
      if (!String(e.active.id).startsWith("card-")) return;
      const overId = e.over ? String(e.over.id) : null;
      const fields = buildDragMoveFieldsFromOverId(overId);
      if (fields) collab.notifyDragMove(fields);
    },
    [collab]
  );

  const handleKanbanDragCancel = useCallback(() => {
    collab.notifyDragEnd();
  }, [collab]);

  const handleKanbanDragEnd = useCallback(
    (e: DragEndEvent) => {
      const raw = e.active.data.current as { dragIds?: string[] } | undefined;
      const batch = (raw?.dragIds?.length ?? 0) > 1;
      const wasCard = String(e.active.id).startsWith("card-");
      dnd.handleDragEnd(e);
      if (wasCard) collab.notifyDragEnd();
      if (e.over && batch) clearSelectionRef.current?.();
    },
    [dnd, collab]
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
    const copilotQ = q.get("q");
    const flowHealth = q.get("flowHealth");
    const sprintPanel = q.get("sprintPanel");
    const sprintCoach = q.get("sprintCoach");
    const standup = q.get("standup");
    const scrumSettings = q.get("scrumSettings");
    const incrementReview = q.get("incrementReview");
    const kanbanCadence = q.get("kanbanCadence");
    const lssAssist = q.get("lssAssist");
    const fluxyOpen = q.get("fluxyOpen") === "1";
    const fluxySala = q.get("fluxySala") === "1";
    const fluxyCardThread = q.get("fluxyCardThread") === "1";
    const fluxyMsg = q.get("fluxyMsg");
    const fluxyCtx = q.get("fluxyCtx");
    const viewParam = parseViewParam(q.get("view"));
    const execFilterParam = parseExecFilterParam(q.get("execFilter"));
    const clevelPreset = q.get("clevel") === "1";

    const hasDeepLink =
      Boolean(cardId) ||
      newCard === "1" ||
      copilot === "1" ||
      fluxyOpen ||
      fluxySala ||
      fluxyCardThread ||
      Boolean(fluxyCtx) ||
      Boolean(fluxyMsg) ||
      flowHealth === "1" ||
      sprintPanel === "1" ||
      sprintCoach === "1" ||
      standup === "1" ||
      scrumSettings === "1" ||
      incrementReview === "1" ||
      kanbanCadence === "1" ||
      lssAssist === "1" ||
      Boolean(viewParam) ||
      execFilterParam != null ||
      clevelPreset;

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

    if (cardId && fluxyCardThread) {
      const c = useBoardStore.getState().db?.cards.find((x) => x.id === cardId);
      if (c) {
        setModalCardRef.current(c);
        setModalModeRef.current("edit");
      }
      try {
        sessionStorage.setItem(
          "flux-board.fluxyCardThread",
          JSON.stringify({ focusComposer: true, messageId: fluxyMsg || null })
        );
      } catch {
        /* ignore */
      }
      if (fluxyOpen || fluxySala) useCopilotStore.getState().setOpen(true);
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }

    if (cardId) {
      const c = useBoardStore.getState().db?.cards.find((x) => x.id === cardId);
      if (c) {
        setModalCardRef.current(c);
        setModalModeRef.current("edit");
      }
      const wantsDock = fluxySala || Boolean(fluxyCtx) || Boolean(fluxyMsg);
      if (wantsDock) {
        useCopilotStore.getState().setFluxyBoardDock({
          expandSala: fluxySala || Boolean(fluxyCtx || fluxyMsg),
          contextCardId: fluxyCtx || cardId,
          highlightMessageId: fluxyMsg || null,
          focusComposer: true,
        });
      }
      if (fluxyOpen || fluxySala || copilot === "1") useCopilotStore.getState().setOpen(true);
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }

    if (fluxyOpen || fluxySala || fluxyCtx || fluxyMsg) {
      useCopilotStore.getState().setFluxyBoardDock({
        expandSala: fluxySala || Boolean(fluxyCtx || fluxyMsg),
        contextCardId: fluxyCtx,
        highlightMessageId: fluxyMsg || null,
        focusComposer: true,
      });
      if (fluxyOpen || fluxySala) useCopilotStore.getState().setOpen(true);
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
      if (copilotQ && copilotQ.trim()) {
        try {
          useCopilotStore.getState().setDraft(decodeURIComponent(copilotQ.trim()));
        } catch {
          useCopilotStore.getState().setDraft(copilotQ.trim());
        }
      }
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
      return;
    }

    if (viewParam || execFilterParam != null || clevelPreset) {
      const allowedViews = allowedBoardViewModes;
      if (viewParam && allowedViews.includes(viewParam)) {
        setBoardView(viewParam);
      }
      if (execFilterParam) {
        useKanbanUiStore.getState().setExecutivePresentationFilter(boardId, execFilterParam);
      }
      if (clevelPreset) {
        setFocusMode(true);
      }
      routerRef.current.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
    }
  }, [searchParamsKey, boardId, localeRoot, methodology, allowedBoardViewModes, setBoardView]);

  useEffect(() => {
    const card = modalCard;
    if (!user?.id || modalMode !== "edit" || !card?.id) return;
    registerRecentCard(user.id, {
      boardId,
      boardName,
      cardId: card.id,
      title: card.title || card.id,
    });
  }, [user?.id, boardId, boardName, modalMode, modalCard]);

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

  const openCardEditorById = useCallback(
    (id: string) => {
      const c = useBoardStore.getState().db?.cards.find((x) => x.id === id);
      if (c) {
        setModalCard(c);
        setModalMode("edit");
      }
    },
    [setModalCard, setModalMode]
  );

  const onEditCardById = useCallback(
    (id: string) => {
      if (openingCardId) return;
      if (prefersReducedMotion) {
        openCardEditorById(id);
        return;
      }
      setOpeningCardId(id);
      window.setTimeout(() => {
        openCardEditorById(id);
        setOpeningCardId(null);
      }, 220);
    },
    [openingCardId, openCardEditorById, prefersReducedMotion]
  );

  const createSwotInitiative = useCallback(
    (strategy: SwotTowsStrategy) => {
      let createdId: string | null = null;
      updateDb((d) => {
        const card = strategyToInitiative(strategy, d.cards);
        while (d.cards.some((existing) => existing.id === card.id)) {
          card.id = `${card.id}_${Math.random().toString(36).slice(2, 6)}`;
        }
        d.cards.push(card);
        createdId = card.id;
      });
      if (createdId) {
        pushToast({ kind: "success", title: t("board.swot.initiativeCreated") });
        onEditCardById(createdId);
      }
    },
    [onEditCardById, pushToast, t, updateDb]
  );

  const onOpenDescById = useCallback(
    (id: string) => {
      const c = useBoardStore.getState().db?.cards.find((x) => x.id === id);
      if (c) setDescModalCard(c);
    },
    [setDescModalCard]
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
      setModalCard(null);
    },
    [updateDb, pushToast, t, setModalCard]
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
    onBoardReloaded,
    canAdminBoard,
    onOpenAgileSettings: () => {
      board.setAddColumnOpen(false);
      setScrumSettingsOpen(true);
    },
  }),
    onOpenExistingCard: onEditCardById,
    onMergeDraftIntoExisting,
    onCardsBatchDeleted: () => clearSelectionRef.current?.(),
  };

  const showSprintInlineBadge =
    isSprintMethodology(methodology) &&
    activeSprintBoard?.status === "active" &&
    Boolean(sprintProgress);

  const activeSprintRibbon =
    isSprintMethodology(methodology) && activeSprintBoard?.status === "active" && activeSprintBoard && sprintProgress ? (
      <BoardActiveSprintContext
        boardId={boardId}
        locale={locale}
        sprint={activeSprintBoard}
        sprintProgress={sprintProgress}
        sprintScopeOnly={sprintScopeOnly}
        toggleSprintScopeOnly={toggleSprintScopeOnly}
        t={t}
      />
    ) : null;

  return (
    <>
      {focusMode && (
        <BoardFocusModeBar
          onExit={toggleFocusMode}
          locale={locale}
          boardId={boardId}
          focusSprint={
            isSprintMethodology(methodology) && activeSprintBoard?.status === "active" && activeSprintBoard
              ? { sprintId: activeSprintBoard.id, sprintName: activeSprintBoard.name }
              : null
          }
        />
      )}

      {!focusMode && (
        <BoardChromeSticky
          surfaceVariant="glass"
          tChrome={(key) => t(`board.${key}`)}
          l3TriggerSummary={
            <span className="truncate">
              {t("board.chrome.l3SummaryWip", { n: board.executionInsights.inProgress })}
            </span>
          }
          l1={{
            boardId,
            boardName,
            cards: board.cards,
            buckets: board.buckets,
            nlqExpanded,
            setNlqExpanded,
            onda4Omnibar: onda4.enabled && onda4.omnibar,
            getHeaders,
            boardView: boardView as BoardViewMode,
            setBoardView,
            allowedViewModes: allowedBoardViewModes,
            showSprintInlineBadge,
            activeSprintName: activeSprintBoard?.status === "active" ? activeSprintBoard.name ?? null : null,
            sprintProgress,
            sprintScopeOnly,
            toggleSprintScopeOnly,
            searchQuery,
            setSearchQuery,
            searchInputRef: filters.searchInputRef,
            t,
            tTimeline: tView as (k: string) => string,
            onEnterFocusMode: toggleFocusMode,
            onOpenFilterModal: () => setFiltersOpen(true),
          }}
          l3={{
            boardId,
            boardName,
            getHeaders,
            methodology,
            methodologyModule,
            board,
            portfolioSnapshot,
            flowChips,
            insightFocusCardIds,
            setInsightFocusCardIds,
            clearInsightFocus,
            intelligenceExpanded,
            toggleIntelligenceExpanded,
            detailChromeExpanded,
            toggleDetailChromeExpanded,
            nlqExpanded,
            activeSprintBoard: activeSprintBoard ?? null,
            sprintProgress,
            sprintScopeOnly,
            toggleSprintScopeOnly,
            onOpenFlowHealth: () => setFlowHealthOpen(true),
            onOpenSprintCoach: () => setSprintCoachOpen(true),
            onOpenKanbanCadence: () => setKanbanCadenceOpen(true),
            onOpenWorkloadBalance: () => setWorkloadBalanceOpen(true),
            onOpenKnowledgeGraph: () => setKnowledgeGraphOpen(true),
            onOpenScrumSettings: () => setScrumSettingsOpen(true),
            onOpenIncrementReview: () => setIncrementReviewOpen(true),
            onOpenLssAssist: () => setLssAssistOpen(true),
            onOpenSafeAssist: () => setSafeAssistOpen(true),
            onda4Omnibar: onda4.enabled && onda4.omnibar,
            sprintRowSuppressedByL1: showSprintInlineBadge,
            t,
          }}
          chromeFooter={activeSprintRibbon}
        />
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
          onDragStart={handleKanbanDragStart}
          onDragMove={handleKanbanDragMove}
          onDragCancel={handleKanbanDragCancel}
          onDragEnd={handleKanbanDragEnd}
          selfUserId={user?.id ?? ""}
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
          openingCardId={openingCardId}
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
          canAdminBoard={canAdminBoard}
          executiveBoardName={boardName}
          executiveProductGoal={db.config.productGoal}
          executiveProductGoalEditable={isSprintMethodology(methodology as BoardMethodology)}
          onExecutiveSaveProductGoal={saveExecutiveProductGoal}
          executiveStakeholderNote={db.config.executiveStakeholderNote}
          onExecutiveSaveStakeholderNote={saveExecutiveStakeholderNote}
          executiveLastUpdated={db.lastUpdated}
          executiveBoardId={boardId}
          getHeaders={getHeaders}
          executivePresentationFilter={executivePresentationFilter}
          onExecutivePresentationFilterChange={setExecutivePresentationFilter}
          onExecutiveOpenCard={board.handleTimelineOpenCard}
          onExecutiveRefreshBoardData={reloadBoardFromServer}
          onPatchCard={board.patchCardFromTable}
          onDuplicateCard={board.duplicateCard}
          onSwotCreateInitiative={createSwotInitiative}
          onPinCardToTop={board.pinCardToTop}
          onVisibleColumnKeyChange={onVisibleColumnKeyChange}
          sprintBoardQuickActions={isSprintMethodology(methodology) ? { boardId, getHeaders } : undefined}
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
          doneBucketKeys={doneBucketKeys}
          historicalCycleDays={historicalCycleDays}
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

        <BoardMobileToolHub
          onOpenDaily={openDailyModal}
          onToggleFocusMode={toggleFocusMode}
        />

        <BoardSummaryDock
        t={t}
        buckets={board.buckets}
        visibleCardsByBucket={filters.visibleCardsByBucket}
        cards={board.cards}
        directions={directions}
        directionCounts={board.directionCounts}
        totalWithDir={board.totalWithDir}
        />

        <WipOverrideModal
          pending={board.wipOverridePending}
          onConfirm={board.confirmWipOverride}
          onClose={board.dismissWipOverride}
        />
        <KanbanBoardOverlays {...overlayProps} />
      </BoardCardSelectionProvider>
      <FilterModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        priorities={priorities}
        labels={Array.from(new Set(board.cards.flatMap((c) => c.tags))).sort((a, b) => a.localeCompare(b))}
        matrixWeightOptions={matrixWeightOptions}
        sprintEnabled={isSprintMethodology(methodology) && activeSprintBoard?.status === "active"}
        initialState={{
          activePrio,
          activeLabels: [...activeLabels],
          searchQuery,
          matrixWeightFilter,
          sprintScopeOnly,
        }}
        onApply={(next) => {
          setActivePrio(next.activePrio);
          setActiveLabels(new Set(next.activeLabels));
          setSearchQuery(next.searchQuery);
          setMatrixWeightFilter(next.matrixWeightFilter);
          setSprintScopeOnly(next.sprintScopeOnly);
        }}
        onClear={() => {
          setActivePrio("all");
          setActiveLabels(new Set());
          setSearchQuery("");
          setMatrixWeightFilter("all");
          setSprintScopeOnly(false);
          clearInsightFocus();
        }}
        t={t}
        searchInputRef={filterSearchInputRef}
        onOpenBacklogPrioritize={
          user
            ? () => {
                setBacklogPrioritizeOpen(true);
              }
            : undefined
        }
      />
      {user ? (
        <BoardBacklogPrioritizeDrawer
          boardId={boardId}
          open={backlogPrioritizeOpen}
          onClose={() => setBacklogPrioritizeOpen(false)}
          getHeaders={getHeaders}
        />
      ) : null}

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
      <BoardSafeAssistPanel
        open={safeAssistOpen}
        onClose={() => setSafeAssistOpen(false)}
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
  const hasDb = useBoardStore((s) => s.db != null);
  if (!hasDb) return null;
  return (
    <Suspense fallback={<SkeletonKanbanBoard />}>
      <KanbanBoardLoaded {...props} />
    </Suspense>
  );
}
