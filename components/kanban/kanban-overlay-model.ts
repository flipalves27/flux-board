import type { RefObject } from "react";
import type { BoardData } from "@/app/board/[id]/page";
import type { DailyInsightsPanelProps } from "./DailyInsightsPanel";
import type { KanbanBoardOverlaysProps } from "./kanban-board-overlays";

type BoardState = {
  modalCard: KanbanBoardOverlaysProps["modalCard"];
  modalMode: KanbanBoardOverlaysProps["modalMode"];
  setModalCard: KanbanBoardOverlaysProps["setModalCard"];
  buckets: KanbanBoardOverlaysProps["buckets"];
  boardLabels: KanbanBoardOverlaysProps["boardLabels"];
  cards: KanbanBoardOverlaysProps["cards"];
  createLabel: KanbanBoardOverlaysProps["createLabel"];
  deleteLabel: KanbanBoardOverlaysProps["deleteLabel"];
  descModalCard: KanbanBoardOverlaysProps["descModalCard"];
  setDescModalCard: KanbanBoardOverlaysProps["setDescModalCard"];
  mapaOpen: KanbanBoardOverlaysProps["mapaOpen"];
  setMapaOpen: KanbanBoardOverlaysProps["setMapaOpen"];
  addColumnOpen: KanbanBoardOverlaysProps["addColumnOpen"];
  setAddColumnOpen: KanbanBoardOverlaysProps["setAddColumnOpen"];
  newColumnName: KanbanBoardOverlaysProps["newColumnName"];
  setNewColumnName: KanbanBoardOverlaysProps["setNewColumnName"];
  editingColumnKey: KanbanBoardOverlaysProps["editingColumnKey"];
  setEditingColumnKey: KanbanBoardOverlaysProps["setEditingColumnKey"];
  saveColumn: KanbanBoardOverlaysProps["saveColumn"];
  confirmDelete: KanbanBoardOverlaysProps["confirmDelete"];
  setConfirmDelete: KanbanBoardOverlaysProps["setConfirmDelete"];
  deleteColumn: KanbanBoardOverlaysProps["deleteColumn"];
  csvImportConfirm: KanbanBoardOverlaysProps["csvImportConfirm"];
  setCsvImportConfirm: KanbanBoardOverlaysProps["setCsvImportConfirm"];
  confirmCsvImport: KanbanBoardOverlaysProps["confirmCsvImport"];
  dailySession: {
    dailyTab: DailyInsightsPanelProps["dailyTab"];
    dailyGenerating: DailyInsightsPanelProps["dailyGenerating"];
    dailyStatusPhase: DailyInsightsPanelProps["dailyStatusPhase"];
    statusStepIndex: DailyInsightsPanelProps["statusStepIndex"];
    dailyLogs: DailyInsightsPanelProps["dailyLogs"];
    dailyTranscript: DailyInsightsPanelProps["dailyTranscript"];
    setDailyTranscript: (v: string) => void;
    dailyFileName: DailyInsightsPanelProps["dailyFileName"];
    dailyHistoryDateFrom: DailyInsightsPanelProps["dailyHistoryDateFrom"];
    dailyHistoryDateTo: DailyInsightsPanelProps["dailyHistoryDateTo"];
    dailyHistorySearchQuery: DailyInsightsPanelProps["dailyHistorySearchQuery"];
    dailyInsights: DailyInsightsPanelProps["dailyInsights"];
    filteredDailyInsights: DailyInsightsPanelProps["filteredDailyInsights"];
    activeDailyHistoryId: DailyInsightsPanelProps["activeDailyHistoryId"];
    activeCreatedCardsExpandedId: DailyInsightsPanelProps["activeCreatedCardsExpandedId"];
    slugDaily: DailyInsightsPanelProps["slugDaily"];
    closeDailyModal: DailyInsightsPanelProps["onClose"];
    startNewDaily: DailyInsightsPanelProps["onClickNewDaily"];
    openHistoryTab: DailyInsightsPanelProps["onClickHistoryTab"];
    openStatusTab: DailyInsightsPanelProps["onClickStatusTab"];
    loadDailyTranscriptFile: DailyInsightsPanelProps["onLoadDailyTranscriptFile"];
    transcribeDailyRecording: DailyInsightsPanelProps["onTranscribeDailyRecording"];
    clearDailyAttachmentAndTranscript: DailyInsightsPanelProps["onClearDailyAttachmentAndTranscript"];
    onGenerateDailyInsight: DailyInsightsPanelProps["onGenerateDailyInsight"];
    onGenerateDailyInsightAndCreateCards: DailyInsightsPanelProps["onGenerateDailyInsightAndCreateCards"];
    dailyTranscribing: DailyInsightsPanelProps["dailyTranscribing"];
    clearDailyLogs: DailyInsightsPanelProps["onClearDailyLogs"];
    onOpenDailyHistoryFromStatusEntry: DailyInsightsPanelProps["onOpenDailyHistoryFromStatusEntry"];
    setDailyHistoryDateFrom: DailyInsightsPanelProps["onSetDailyHistoryDateFrom"];
    setDailyHistoryDateTo: DailyInsightsPanelProps["onSetDailyHistoryDateTo"];
    setDailyHistorySearchQuery: DailyInsightsPanelProps["onSetDailyHistorySearchQuery"];
    clearDailyHistoryFilters: DailyInsightsPanelProps["onClearDailyHistoryFilters"];
    onToggleDailyHistoryExpanded: DailyInsightsPanelProps["onToggleDailyHistoryExpanded"];
    onCollapseDailyHistoryExpanded: DailyInsightsPanelProps["onCollapseDailyHistoryExpanded"];
    onDownloadDailyContextDoc: DailyInsightsPanelProps["onDownloadDailyContextDoc"];
    onCopyDailyContextDoc: DailyInsightsPanelProps["onCopyDailyContextDoc"];
    onCreateCardsFromInsight: DailyInsightsPanelProps["onCreateCardsFromInsight"];
    requestDeleteDailyHistoryEntry: DailyInsightsPanelProps["onDeleteDailyHistoryEntry"];
    expandDailyHistoryCreatedCards: DailyInsightsPanelProps["onExpandDailyHistoryCreatedCards"];
    dailyDeleteConfirmId: string | null;
    cancelDeleteDailyHistoryEntry: () => void;
    confirmDeleteDailyHistoryEntry: () => void;
  };
};

export function buildKanbanOverlayModel(args: {
  t: KanbanBoardOverlaysProps["t"];
  updateDb: KanbanBoardOverlaysProps["updateDb"];
  boardId: string;
  boardName: string;
  getHeaders: KanbanBoardOverlaysProps["getHeaders"];
  priorities: KanbanBoardOverlaysProps["priorities"];
  progresses: KanbanBoardOverlaysProps["progresses"];
  mapaProducao: BoardData["mapaProducao"];
  board: BoardState;
  dailyOpen: boolean;
  addColumnDialogRef: RefObject<HTMLDivElement | null>;
  addColumnInputRef: RefObject<HTMLInputElement | null>;
  confirmDeleteDialogRef: RefObject<HTMLDivElement | null>;
  confirmDeleteCancelRef: RefObject<HTMLButtonElement | null>;
  dailyDialogRef: RefObject<HTMLDivElement | null>;
  dailyCloseRef: RefObject<HTMLButtonElement | null>;
}): KanbanBoardOverlaysProps {
  const { board, dailyOpen, boardName, boardId, getHeaders, priorities, progresses, mapaProducao, t, updateDb } = args;
  const d = board.dailySession;

  const dailyPanelProps: DailyInsightsPanelProps = {
    boardName,
    dailyTab: d.dailyTab,
    dailyGenerating: d.dailyGenerating,
    dailyStatusPhase: d.dailyStatusPhase,
    statusStepIndex: d.statusStepIndex,
    dailyLogs: d.dailyLogs,
    dailyTranscript: d.dailyTranscript,
    dailyFileName: d.dailyFileName,
    dailyHistoryDateFrom: d.dailyHistoryDateFrom,
    dailyHistoryDateTo: d.dailyHistoryDateTo,
    dailyHistorySearchQuery: d.dailyHistorySearchQuery,
    dailyInsights: d.dailyInsights,
    filteredDailyInsights: d.filteredDailyInsights,
    activeDailyHistoryId: d.activeDailyHistoryId,
    activeCreatedCardsExpandedId: d.activeCreatedCardsExpandedId,
    dailyDialogRef: args.dailyDialogRef,
    dailyCloseRef: args.dailyCloseRef,
    slugDaily: d.slugDaily,
    onClose: d.closeDailyModal,
    onClickNewDaily: d.startNewDaily,
    onClickHistoryTab: d.openHistoryTab,
    onClickStatusTab: d.openStatusTab,
    onLoadDailyTranscriptFile: d.loadDailyTranscriptFile,
    onTranscribeDailyRecording: d.transcribeDailyRecording,
    onClearDailyAttachmentAndTranscript: d.clearDailyAttachmentAndTranscript,
    onDailyTranscriptChange: d.setDailyTranscript,
    onGenerateDailyInsight: d.onGenerateDailyInsight,
    onGenerateDailyInsightAndCreateCards: d.onGenerateDailyInsightAndCreateCards,
    dailyTranscribing: d.dailyTranscribing,
    onClearDailyLogs: d.clearDailyLogs,
    onOpenDailyHistoryFromStatusEntry: d.onOpenDailyHistoryFromStatusEntry,
    onSetDailyHistoryDateFrom: d.setDailyHistoryDateFrom,
    onSetDailyHistoryDateTo: d.setDailyHistoryDateTo,
    onSetDailyHistorySearchQuery: d.setDailyHistorySearchQuery,
    onClearDailyHistoryFilters: d.clearDailyHistoryFilters,
    onToggleDailyHistoryExpanded: d.onToggleDailyHistoryExpanded,
    onCollapseDailyHistoryExpanded: d.onCollapseDailyHistoryExpanded,
    onDownloadDailyContextDoc: d.onDownloadDailyContextDoc,
    onCopyDailyContextDoc: d.onCopyDailyContextDoc,
    onCreateCardsFromInsight: d.onCreateCardsFromInsight,
    onDeleteDailyHistoryEntry: d.requestDeleteDailyHistoryEntry,
    onExpandDailyHistoryCreatedCards: d.expandDailyHistoryCreatedCards,
  };

  return {
    t,
    updateDb,
    boardId,
    boardName,
    getHeaders,
    priorities,
    progresses,
    mapaProducao,
    modalCard: board.modalCard,
    modalMode: board.modalMode,
    setModalCard: board.setModalCard,
    buckets: board.buckets,
    boardLabels: board.boardLabels,
    cards: board.cards,
    createLabel: board.createLabel,
    deleteLabel: board.deleteLabel,
    descModalCard: board.descModalCard,
    setDescModalCard: board.setDescModalCard,
    mapaOpen: board.mapaOpen,
    setMapaOpen: board.setMapaOpen,
    addColumnOpen: board.addColumnOpen,
    setAddColumnOpen: board.setAddColumnOpen,
    newColumnName: board.newColumnName,
    setNewColumnName: board.setNewColumnName,
    editingColumnKey: board.editingColumnKey,
    setEditingColumnKey: board.setEditingColumnKey,
    saveColumn: board.saveColumn,
    addColumnDialogRef: args.addColumnDialogRef,
    addColumnInputRef: args.addColumnInputRef,
    confirmDelete: board.confirmDelete,
    setConfirmDelete: board.setConfirmDelete,
    confirmDeleteDialogRef: args.confirmDeleteDialogRef,
    confirmDeleteCancelRef: args.confirmDeleteCancelRef,
    deleteColumn: board.deleteColumn,
    dailyDeleteConfirmId: d.dailyDeleteConfirmId,
    cancelDeleteDailyHistoryEntry: d.cancelDeleteDailyHistoryEntry,
    confirmDeleteDailyHistoryEntry: d.confirmDeleteDailyHistoryEntry,
    csvImportConfirm: board.csvImportConfirm,
    setCsvImportConfirm: board.setCsvImportConfirm,
    confirmCsvImport: board.confirmCsvImport,
    dailyOpen,
    dailyPanelProps,
  };
}
