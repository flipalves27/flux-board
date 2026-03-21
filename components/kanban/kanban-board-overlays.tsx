"use client";

import type { RefObject } from "react";
import type { BoardData, CardData } from "@/app/board/[id]/page";
import { useBoardStore } from "@/stores/board-store";
import { CardModal } from "./card-modal";
import { DescModal } from "./desc-modal";
import { DailyInsightsPanel, type DailyInsightsPanelProps } from "./DailyInsightsPanel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MapaProducaoSection } from "./mapa-producao-section";

type KanbanT = (key: string, values?: Record<string, string | number>) => string;

type ConfirmDeleteState = { type: "card" | "bucket"; id: string; label: string } | null;

type CsvImportConfirm = {
  count: number;
  cards: CardData[];
  mode: "replace" | "merge";
  sameIdCount: number;
} | null;

type BoardBuckets = BoardData["config"]["bucketOrder"];

export type KanbanBoardOverlaysProps = {
  t: KanbanT;
  boardId: string;
  boardName: string;
  getHeaders: () => Record<string, string>;
  priorities: string[];
  progresses: string[];
  directions: string[];
  mapaProducao: BoardData["mapaProducao"];
  modalCard: CardData | null;
  modalMode: "new" | "edit";
  setModalCard: (v: CardData | null) => void;
  buckets: BoardBuckets;
  boardLabels: string[];
  cards: CardData[];
  createLabel: (label: string) => void;
  deleteLabel: (label: string) => void;
  descModalCard: CardData | null;
  setDescModalCard: (v: CardData | null) => void;
  mapaOpen: boolean;
  setMapaOpen: (v: boolean) => void;
  addColumnOpen: boolean;
  setAddColumnOpen: (v: boolean) => void;
  newColumnName: string;
  setNewColumnName: (v: string) => void;
  editingColumnKey: string | null;
  setEditingColumnKey: (v: string | null) => void;
  saveColumn: () => void;
  addColumnDialogRef: RefObject<HTMLDivElement | null>;
  addColumnInputRef: RefObject<HTMLInputElement | null>;
  confirmDelete: ConfirmDeleteState;
  setConfirmDelete: (v: ConfirmDeleteState) => void;
  confirmDeleteDialogRef: RefObject<HTMLDivElement | null>;
  confirmDeleteCancelRef: RefObject<HTMLButtonElement | null>;
  deleteColumn: (key: string) => void;
  dailyDeleteConfirmId: string | null;
  cancelDeleteDailyHistoryEntry: () => void;
  confirmDeleteDailyHistoryEntry: () => void;
  csvImportConfirm: CsvImportConfirm;
  setCsvImportConfirm: (v: CsvImportConfirm) => void;
  confirmCsvImport: () => void;
  dailyOpen: boolean;
  dailyPanelProps: DailyInsightsPanelProps;
};

export function KanbanBoardOverlays({
  t,
  boardId,
  boardName,
  getHeaders,
  priorities,
  progresses,
  directions,
  mapaProducao,
  modalCard,
  modalMode,
  setModalCard,
  buckets,
  boardLabels,
  cards,
  createLabel,
  deleteLabel,
  descModalCard,
  setDescModalCard,
  mapaOpen,
  setMapaOpen,
  addColumnOpen,
  setAddColumnOpen,
  newColumnName,
  setNewColumnName,
  editingColumnKey,
  setEditingColumnKey,
  saveColumn,
  addColumnDialogRef,
  addColumnInputRef,
  confirmDelete,
  setConfirmDelete,
  confirmDeleteDialogRef,
  confirmDeleteCancelRef,
  deleteColumn,
  dailyDeleteConfirmId,
  cancelDeleteDailyHistoryEntry,
  confirmDeleteDailyHistoryEntry,
  csvImportConfirm,
  setCsvImportConfirm,
  confirmCsvImport,
  dailyOpen,
  dailyPanelProps,
}: KanbanBoardOverlaysProps) {
  const updateDb = useBoardStore((s) => s.updateDb);

  return (
    <>
      {modalCard && (
        <CardModal
          card={modalCard}
          mode={modalMode}
          buckets={buckets}
          priorities={priorities}
          progresses={progresses}
          directions={directions}
          filterLabels={boardLabels}
          boardId={boardId}
          boardName={boardName}
          getHeaders={getHeaders}
          onCreateLabel={createLabel}
          onDeleteLabel={deleteLabel}
          peerCards={cards.filter((c) => c.id && c.id !== modalCard.id)}
          onClose={() => setModalCard(null)}
          onSave={(updated) => {
            updateDb((d) => {
              if (modalMode === "new") {
                d.cards.push({
                  ...updated,
                  order: d.cards.filter((c) => c.bucket === updated.bucket).length,
                });
              } else {
                const i = d.cards.findIndex((c) => c.id === updated.id);
                if (i >= 0) d.cards[i] = { ...d.cards[i], ...updated };
              }
            });
            setModalCard(null);
          }}
          onDelete={(id) => {
            updateDb((d) => {
              d.cards = d.cards.filter((c) => c.id !== id);
              d.cards.forEach((c) => {
                if (c.blockedBy?.length) c.blockedBy = c.blockedBy.filter((bid) => bid !== id);
              });
            });
            setModalCard(null);
          }}
        />
      )}

      {descModalCard && (
        <DescModal
          card={descModalCard}
          onClose={() => setDescModalCard(null)}
          onSave={(cardId, desc) => {
            updateDb((d) => {
              const c = d.cards.find((x) => x.id === cardId);
              if (c) c.desc = desc;
            });
            setDescModalCard(null);
          }}
        />
      )}

      <MapaProducaoSection
        open={mapaOpen}
        onClose={() => setMapaOpen(false)}
        mapaProducao={mapaProducao || []}
        onSave={(arr) =>
          updateDb((d) => {
            d.mapaProducao = arr;
          })
        }
      />

      {addColumnOpen && (
        <div
          className="fixed inset-0 bg-[var(--flux-backdrop-scrim-strong)] z-[400] flex items-center justify-center"
          onClick={() => setAddColumnOpen(false)}
        >
          <div
            className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad)] p-6 min-w-[280px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
            ref={addColumnDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-column-title"
            tabIndex={-1}
          >
            <h3 id="add-column-title" className="font-display font-bold text-[var(--flux-text)] mb-4">
              {editingColumnKey ? t("addColumnModal.title.rename") : t("addColumnModal.title.new")}
            </h3>
            <input
              type="text"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveColumn()}
              placeholder={t("addColumnModal.placeholder")}
              className="w-full px-3 py-2 border border-[var(--flux-control-border)] rounded-[var(--flux-rad)] text-sm mb-4 bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
              autoFocus
              ref={addColumnInputRef}
            />
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setAddColumnOpen(false);
                  setNewColumnName("");
                  setEditingColumnKey(null);
                }}
                className="btn-secondary"
              >
                {t("addColumnModal.cancel")}
              </button>
              <button type="button" onClick={saveColumn} className="btn-primary">
                {editingColumnKey ? t("addColumnModal.save") : t("addColumnModal.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-[var(--flux-backdrop-scrim-strong)] z-[400] flex items-center justify-center">
          <div
            className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad)] p-6 min-w-[280px] text-center shadow-xl"
            ref={confirmDeleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            tabIndex={-1}
          >
            <p id="confirm-delete-title" className="text-[var(--flux-text)] mb-4 font-medium">
              {confirmDelete.type === "card"
                ? t("confirmDelete.cardTitle", {
                    cardTitle: cards.find((c) => c.id === confirmDelete.id)?.title || "",
                  })
                : t("confirmDelete.columnTitle", {
                    columnLabel: confirmDelete.label,
                  })}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="btn-secondary"
                ref={confirmDeleteCancelRef}
              >
                {t("confirmDelete.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmDelete.type === "card") {
                    const removed = confirmDelete.id;
                    updateDb((d) => {
                      d.cards = d.cards.filter((c) => c.id !== removed);
                      d.cards.forEach((c) => {
                        if (c.blockedBy?.length) c.blockedBy = c.blockedBy.filter((bid) => bid !== removed);
                      });
                    });
                  } else {
                    deleteColumn(confirmDelete.id);
                  }
                  setConfirmDelete(null);
                }}
                className="btn-danger-solid"
              >
                {t("confirmDelete.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dailyDeleteConfirmId !== null}
        title={t("dailyDelete.title")}
        description={t("dailyDelete.description")}
        intent="danger"
        confirmText={t("confirmDelete.confirm")}
        cancelText={t("confirmDelete.cancel")}
        onCancel={cancelDeleteDailyHistoryEntry}
        onConfirm={confirmDeleteDailyHistoryEntry}
      />

      <ConfirmDialog
        open={csvImportConfirm !== null}
        title={
          csvImportConfirm
            ? csvImportConfirm.mode === "replace"
              ? t("csvImportConfirm.title.replace", { count: csvImportConfirm.count })
              : t("csvImportConfirm.title.merge", { count: csvImportConfirm.count })
            : ""
        }
        description={
          csvImportConfirm
            ? csvImportConfirm.mode === "replace"
              ? t("csvImportConfirm.description.replace")
              : t("csvImportConfirm.description.merge", {
                  existingCount: csvImportConfirm.sameIdCount,
                  newCount: csvImportConfirm.count - csvImportConfirm.sameIdCount,
                })
            : undefined
        }
        intent="danger"
        confirmText={csvImportConfirm?.mode === "merge" ? t("csvImportConfirm.merge") : t("csvImportConfirm.import")}
        cancelText={t("confirmDelete.cancel")}
        onCancel={() => setCsvImportConfirm(null)}
        onConfirm={confirmCsvImport}
      />

      {dailyOpen && <DailyInsightsPanel {...dailyPanelProps} />}
    </>
  );
}
