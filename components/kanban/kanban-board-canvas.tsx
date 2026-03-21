"use client";

import type { ComponentProps, RefObject } from "react";
import { DndContext, DragOverlay, type CollisionDetection, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";
import type { BoardViewMode } from "./kanban-constants";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { BoardTimelineView } from "./board-timeline-view";
import { BoardTableView } from "./board-table-view";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { DIR_COLORS } from "./kanban-constants";
import { parseSlotId } from "./kanban-dnd-utils";

type KanbanBoardCanvasProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  boardScrollRef: RefObject<HTMLDivElement | null>;
  boardView: BoardViewMode;
  priorityBarVisible: boolean;
  isPanning: boolean;
  onPanPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void;
  cards: CardData[];
  buckets: BucketConfig[];
  collapsed: Set<string>;
  directions: string[];
  filterCard: (c: CardData) => boolean;
  visibleCardsByBucket: (key: string) => CardData[];
  onTimelineDueDate: (cardId: string, nextDue: string) => void;
  onTimelineOpenCard: (card: CardData) => void;
  priorities: string[];
  onPatchCardFromTable: (
    cardId: string,
    patch: Partial<Pick<CardData, "title" | "priority" | "dueDate" | "bucket" | "tags">>
  ) => void;
  onTableOpenCard: (card: CardData) => void;
  sensors: NonNullable<ComponentProps<typeof DndContext>["sensors"]>;
  collisionDetection: CollisionDetection;
  onDragStart: (e: DragStartEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  activeCard: CardData | null | undefined;
  onToggleCollapse: (key: string) => void;
  onAddCard: (bucketKey: string) => void;
  onEditCard: (cardId: string) => void;
  onDeleteCard: (id: string) => void;
  onRenameColumn: (b: BucketConfig) => void;
  onDeleteColumn: ((key: string) => void) | undefined;
  onSetDirection: (cardId: string, dir: string) => void;
  onOpenDesc: (cardId: string) => void;
  onOpenAddColumn: () => void;
};

export function KanbanBoardCanvas({
  t,
  boardScrollRef,
  boardView,
  priorityBarVisible,
  isPanning,
  onPanPointerDown,
  onPanPointerMove,
  onPanPointerUp,
  onPanPointerCancel,
  cards,
  buckets,
  collapsed,
  directions,
  filterCard,
  visibleCardsByBucket,
  onTimelineDueDate,
  onTimelineOpenCard,
  priorities,
  onPatchCardFromTable,
  onTableOpenCard,
  sensors,
  collisionDetection,
  onDragStart,
  onDragEnd,
  activeCard,
  onToggleCollapse,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onRenameColumn,
  onDeleteColumn,
  onSetDirection,
  onOpenDesc,
  onOpenAddColumn,
}: KanbanBoardCanvasProps) {
  return (
    <div
      ref={boardScrollRef}
      onPointerDown={boardView === "kanban" ? onPanPointerDown : undefined}
      onPointerMove={boardView === "kanban" ? onPanPointerMove : undefined}
      onPointerUp={boardView === "kanban" ? onPanPointerUp : undefined}
      onPointerCancel={boardView === "kanban" ? onPanPointerCancel : undefined}
      className={`board-canvas w-full px-5 sm:px-6 lg:px-8 py-4 pb-6 scrollbar-flux transition-[min-height] duration-300 ease-in-out relative z-[120] ${
        boardView === "kanban"
          ? `flex gap-4 overflow-x-auto items-stretch ${isPanning ? "cursor-grabbing select-none" : "cursor-default"}`
          : "flex flex-col overflow-x-hidden"
      } ${priorityBarVisible ? "min-h-[calc(100vh-240px)]" : "min-h-[calc(100vh-140px)]"}`}
      style={{ touchAction: boardView === "kanban" ? (isPanning ? "none" : "pan-y") : undefined }}
    >
      {boardView === "timeline" ? (
        <BoardTimelineView
          cards={cards}
          buckets={buckets}
          prioritiesOrder={priorities}
          filterCard={filterCard}
          onChangeDueDate={onTimelineDueDate}
          onOpenCard={onTimelineOpenCard}
        />
      ) : null}
      {boardView === "table" ? (
        <BoardTableView
          cards={cards}
          buckets={buckets}
          filterCard={filterCard}
          priorities={priorities}
          onPatchCard={onPatchCardFromTable}
          onOpenCard={onTableOpenCard}
        />
      ) : null}
      {boardView === "kanban" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable: t("board.dnd.screenReaderInstructions.draggable"),
            },
            announcements: {
              onDragStart: ({ active }) => {
                const aid = String(active.id);
                if (aid.startsWith("card-")) {
                  const cardId = aid.replace("card-", "");
                  const card = cards.find((c) => c.id === cardId);
                  return card
                    ? t("board.dnd.announcements.dragStart.cardWithTitle", { cardTitle: card.title })
                    : t("board.dnd.announcements.dragStart.card");
                }
                const col = buckets.find((b) => b.key === aid);
                return col
                  ? t("board.dnd.announcements.dragStart.columnWithTitle", { columnLabel: col.label })
                  : t("board.dnd.announcements.dragStart.column");
              },
              onDragOver: ({ over }) => {
                if (!over) return;
                const overId = String(over.id);
                if (overId.startsWith("bucket-")) {
                  const bucketKey = overId.replace("bucket-", "");
                  const col = buckets.find((b) => b.key === bucketKey);
                  return col
                    ? t("board.dnd.announcements.dragOver.dropOnColumnWithTitle", { columnLabel: col.label })
                    : t("board.dnd.announcements.dragOver.dropOnColumn");
                }
                const slotInfo = parseSlotId(overId);
                if (slotInfo) {
                  const col = buckets.find((b) => b.key === slotInfo.bucketKey);
                  const pos = slotInfo.index + 1;
                  return col
                    ? t("board.dnd.announcements.dragOver.dropOnColumnWithPosition", {
                        columnLabel: col.label,
                        pos,
                      })
                    : t("board.dnd.announcements.dragOver.dropOnPositionOnly", { pos });
                }
                return;
              },
              onDragEnd: ({ over }) => {
                if (!over) return;
                const overId = String(over.id);
                if (overId.startsWith("bucket-")) return t("board.dnd.announcements.dragEnd.dropped");
                const slotInfo = parseSlotId(overId);
                if (slotInfo) return t("board.dnd.announcements.dragEnd.dropped");
                return t("board.dnd.announcements.dragEnd.dropped");
              },
              onDragCancel: () => t("board.dnd.announcements.dragCancel"),
            },
          }}
        >
          <SortableContext items={buckets.map((b) => b.key)} strategy={horizontalListSortingStrategy}>
            {buckets.map((b) => (
              <KanbanColumn
                key={b.key}
                bucket={b}
                cards={visibleCardsByBucket(b.key)}
                collapsed={collapsed.has(b.key)}
                onToggleCollapse={() => onToggleCollapse(b.key)}
                onAddCard={() => onAddCard(b.key)}
                onEditCard={onEditCard}
                onDeleteCard={onDeleteCard}
                onRenameColumn={() => onRenameColumn(b)}
                onDeleteColumn={buckets.length > 1 && onDeleteColumn ? () => onDeleteColumn(b.key) : undefined}
                onSetDirection={(cardId, dir) => onSetDirection(cardId, dir)}
                onOpenDesc={onOpenDesc}
                directions={directions}
                dirColors={DIR_COLORS}
              />
            ))}
          </SortableContext>
          <CustomTooltip content={t("addColumnModal.title.new")} position="right">
            <button
              type="button"
              onClick={onOpenAddColumn}
              className="shrink-0 min-w-[44px] w-[44px] h-[80px] rounded-[var(--flux-rad)] border border-dashed border-[var(--flux-primary-alpha-30)] bg-[var(--flux-surface-card)] flex items-center justify-center text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-08)] transition-all cursor-pointer group opacity-80 hover:opacity-100"
              aria-label={t("addColumnModal.title.new")}
            >
              <span className="text-lg font-light group-hover:scale-110 transition-transform">+</span>
            </button>
          </CustomTooltip>

          <DragOverlay
            dropAnimation={{
              duration: 200,
              easing: "cubic-bezier(0.18, 0.67, 0.6, 1.02)",
            }}
          >
            {activeCard ? (
              <div className="scale-[1.02] shadow-[var(--flux-shadow-kanban-card-lift)] ring-2 ring-[var(--flux-primary)]/50 rounded-xl transition-all duration-200 ease-out">
                <KanbanCard
                  cardId={activeCard.id}
                  directions={directions}
                  dirColors={DIR_COLORS}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onSetDirection={() => {}}
                  onOpenDesc={undefined}
                  isDragging
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
    </div>
  );
}
