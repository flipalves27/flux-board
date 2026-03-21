"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useBoardStore } from "@/stores/board-store";
import { useCopilotStore } from "@/stores/copilot-store";
import { registerRecentCard } from "@/lib/recent-cards";
import { useToast } from "@/context/toast-context";
import { useBoardNlqUiStore } from "@/stores/board-nlq-ui-store";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useTranslations } from "next-intl";
import { useBoardPersistence } from "./hooks/useBoardPersistence";
import { useBoardFilters } from "./hooks/useBoardFilters";
import { useBoardState } from "./hooks/useBoardState";
import { useBoardDnd } from "./hooks/useBoardDnd";
import { BoardNlqDock } from "./board-nlq-dock";
import { KanbanHeaderBar } from "./kanban-header-bar";
import { KanbanToolbar } from "./kanban-toolbar";
import { BoardMetricsStrip } from "./board-metrics-strip";
import { KanbanBoardCanvas } from "./kanban-board-canvas";
import { BoardSummaryDock } from "./board-summary-dock";
import { KanbanBoardOverlays } from "./kanban-board-overlays";
import { buildKanbanOverlayModel } from "./kanban-overlay-model";

export interface KanbanBoardProps {
  boardName: string;
  boardId: string;
  getHeaders: () => Record<string, string>;
  filterLabels: string[];
  priorities: string[];
  progresses: string[];
  directions: string[];
}

function KanbanBoardLoaded({
  boardName,
  boardId,
  getHeaders,
  filterLabels,
  priorities,
  progresses,
  directions,
}: KanbanBoardProps) {
  const t = useTranslations("kanban");
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const { user } = useAuth();
  const { pushToast } = useToast();
  const db = useBoardStore((s) => s.db)!;
  const updateDb = useBoardStore((s) => s.updateDb);

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

  const board = useBoardState({
    boardId,
    getHeaders,
    filterLabels,
    priorities,
    progresses,
    directions,
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
  });

  const dnd = useBoardDnd({
    buckets: board.buckets,
    cards: board.cards,
    getCardsByBucket: filters.getCardsByBucket,
    moveCard: board.moveCard,
    reorderColumns: board.reorderColumns,
  });

  const { dailyOpen, openDailyModal, closeDailyModal, dailyDeleteConfirmId } = board.dailySession;

  useEffect(() => {
    const cardId = searchParams.get("card");
    const newCard = searchParams.get("newCard");
    const copilot = searchParams.get("copilot");
    if (!cardId && newCard !== "1" && copilot !== "1") return;

    if (cardId) {
      const c = useBoardStore.getState().db?.cards.find((x) => x.id === cardId);
      if (c) {
        board.setModalCard(c);
        board.setModalMode("edit");
      }
      router.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }
    if (newCard === "1") {
      const firstBucket = board.buckets[0]?.key;
      if (firstBucket) {
        const order = board.cards.filter((x) => x.bucket === firstBucket).length;
        board.setModalCard({
          id: "",
          bucket: firstBucket,
          priority: "Média",
          progress: "Não iniciado",
          title: "",
          desc: t("board.newCard.defaultDescription"),
          tags: [],
          direction: null,
          dueDate: null,
          blockedBy: [],
          order,
        });
        board.setModalMode("new");
      }
      router.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
      return;
    }
    if (copilot === "1") {
      useCopilotStore.getState().setOpen(true);
      router.replace(`${localeRoot}/board/${boardId}`, { scroll: false });
    }
  }, [
    searchParams,
    boardId,
    router,
    localeRoot,
    board.buckets,
    board.cards,
    board.setModalCard,
    board.setModalMode,
    t,
  ]);

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
  };

  return (
    <>
      <div className="sticky top-[42px] z-[150] flex flex-col">
        <BoardNlqDock
          boardId={boardId}
          getHeaders={getHeaders}
          onExpandFilters={() => filters.setPriorityBarVisible(true)}
        />
        <div
          className="board-toolbar transition-[max-height] duration-300 ease-in-out overflow-y-auto overflow-x-hidden"
          style={{ maxHeight: filters.priorityBarVisible ? "min(640px, 80vh)" : 52 }}
        >
          <KanbanHeaderBar
            t={t}
            priorityBarVisible={filters.priorityBarVisible}
            setPriorityBarVisible={filters.setPriorityBarVisible}
            boardView={boardView}
            setBoardView={setBoardView}
            searchInputRef={filters.searchInputRef}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            csvImportMode={board.csvImportMode}
            setCsvImportMode={(v) =>
              board.setCsvImportMode(typeof v === "function" ? v(board.csvImportMode) : v)
            }
            onImportCSV={board.handleImportCSV}
            onExportCSV={board.handleExportCSV}
          />
          <KanbanToolbar
            t={t}
            priorityBarVisible={filters.priorityBarVisible}
            priorities={priorities}
            activePrio={activePrio}
            setActivePrio={setActivePrio}
            focusMode={filters.focusMode}
            setFocusMode={filters.setFocusMode}
            clearFilters={filters.clearFilters}
            applyFocusMode={filters.applyFocusMode}
            labelsOpen={filters.labelsOpen}
            setLabelsOpen={filters.setLabelsOpen}
            onOpenMapa={() => board.setMapaOpen(true)}
            onOpenDaily={openDailyModal}
            boardLabels={board.boardLabels}
            activeLabels={activeLabels}
            onToggleLabel={filters.toggleLabel}
          />
          {filters.priorityBarVisible && (
            <BoardMetricsStrip t={t} totalCards={board.cards.length} executionInsights={board.executionInsights} />
          )}
        </div>
      </div>

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
        sensors={dnd.sensors}
        collisionDetection={dnd.collisionDetection}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
        activeCard={dnd.activeCard}
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
      />

      <BoardSummaryDock
        t={t}
        buckets={board.buckets}
        visibleCardsByBucket={filters.visibleCardsByBucket}
        cards={board.cards}
        directions={directions}
        directionCounts={board.directionCounts}
        totalWithDir={board.totalWithDir}
        executionInsights={board.executionInsights}
        okrObjectivesLength={board.okrObjectives.length}
        okrLoadError={board.okrLoadError}
        okrProjectionError={board.okrProjectionError}
        currentQuarter={board.currentQuarter}
        okrsComputed={board.okrsComputed}
        okrProjectionByKrId={board.okrProjectionByKrId}
        onOpenCard={(card) => {
          board.setModalCard(card);
          board.setModalMode("edit");
        }}
      />

      <KanbanBoardOverlays {...overlayProps} />
    </>
  );
}

export function KanbanBoard(props: KanbanBoardProps) {
  const db = useBoardStore((s) => s.db);
  if (!db) return null;
  return <KanbanBoardLoaded {...props} />;
}
