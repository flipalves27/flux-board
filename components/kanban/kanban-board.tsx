"use client";

import { useRef } from "react";
import type { BoardData } from "@/app/board/[id]/page";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useTranslations } from "next-intl";
import { useBoardPersistence } from "./hooks/useBoardPersistence";
import { useBoardFilters } from "./hooks/useBoardFilters";
import { useBoardState } from "./hooks/useBoardState";
import { useBoardDnd } from "./hooks/useBoardDnd";
import { KanbanHeaderBar } from "./kanban-header-bar";
import { KanbanToolbar } from "./kanban-toolbar";
import { BoardMetricsStrip } from "./board-metrics-strip";
import { KanbanBoardCanvas } from "./kanban-board-canvas";
import { BoardSummaryDock } from "./board-summary-dock";
import { KanbanBoardOverlays } from "./kanban-board-overlays";
import { buildKanbanOverlayModel } from "./kanban-overlay-model";

interface KanbanBoardProps {
  db: BoardData;
  updateDb: (updater: (prev: BoardData) => BoardData) => void;
  boardName: string;
  boardId: string;
  getHeaders: () => Record<string, string>;
  filterLabels: string[];
  priorities: string[];
  progresses: string[];
  directions: string[];
}

export function KanbanBoard({
  db,
  updateDb,
  boardName,
  boardId,
  getHeaders,
  filterLabels,
  priorities,
  progresses,
  directions,
}: KanbanBoardProps) {
  const t = useTranslations("kanban");

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

  const board = useBoardState({
    db,
    updateDb,
    boardId,
    getHeaders,
    filterLabels,
    priorities,
    progresses,
    directions,
    setActiveLabels,
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
  });

  const dnd = useBoardDnd({
    buckets: board.buckets,
    cards: board.cards,
    getCardsByBucket: filters.getCardsByBucket,
    moveCard: board.moveCard,
    reorderColumns: board.reorderColumns,
  });

  const { dailyOpen, openDailyModal, closeDailyModal, dailyDeleteConfirmId } = board.dailySession;

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

  const updateDirection = (cardId: string, dir: string) => {
    updateDb((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c.id === cardId ? { ...c, direction: c.direction === dir ? null : dir } : c)),
    }));
  };

  const overlayProps = buildKanbanOverlayModel({
    t,
    updateDb,
    boardId,
    boardName,
    getHeaders,
    priorities,
    progresses,
    mapaProducao: db.mapaProducao,
    board,
    dailyOpen,
    addColumnDialogRef,
    addColumnInputRef,
    confirmDeleteDialogRef,
    confirmDeleteCancelRef,
    dailyDialogRef,
    dailyCloseRef,
  });

  return (
    <>
      <div
        className="board-toolbar sticky top-[42px] z-[150] transition-[max-height] duration-300 ease-in-out overflow-y-auto overflow-x-hidden"
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
          setCsvImportMode={board.setCsvImportMode}
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
        onEditCard={(c) => {
          board.setModalCard(c);
          board.setModalMode("edit");
        }}
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
        onOpenDesc={(c) => board.setDescModalCard(c)}
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
