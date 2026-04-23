"use client";

import type { RefObject, ReactNode } from "react";
import { KanbanCard } from "./kanban-card";
import { KanbanColumnDroppableSlot } from "./kanban-column-droppable-slot";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import { KANBAN_COLUMN_CARD_CV_THRESHOLD } from "./kanban-constants";
import { VirtualKanbanColumnCardList } from "./kanban-column-card-list-virtual";

export const KANBAN_COLUMN_VIRTUAL_ENABLED =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_FLUX_KANBAN_VIRTUAL === "1";

export type KanbanColumnCardListProps = {
  scrollRef: RefObject<HTMLDivElement | null>;
  bucketKey: string;
  cards: CardData[];
  useCv: boolean;
  tallSlots: boolean;
  isFirstColumn?: boolean;
  directions: string[];
  dirColors: Record<string, string>;
  boardBuckets: BucketConfig[];
  priorities: string[];
  onEditCard: (cardId: string) => void;
  onDeleteCard: (id: string) => void;
  onSetDirection: (cardId: string, dir: string) => void;
  onOpenDesc?: (cardId: string) => void;
  onPatchCard: (cardId: string, patch: Partial<Pick<CardData, "priority" | "bucket">>) => void;
  onDuplicateCard: (cardId: string) => void;
  onPinCardToTop?: (cardId: string) => void;
  activeDragIds?: string[] | null;
  sprintBoardQuickActions?: { boardId: string; getHeaders: () => Record<string, string> };
  historicalCycleDays?: number[];
  isFinalColumn: boolean;
};

function ClassicKanbanColumnCardList({
  scrollRef: _scrollRef,
  bucketKey,
  cards,
  useCv,
  tallSlots,
  isFirstColumn,
  directions,
  dirColors,
  boardBuckets,
  priorities,
  onEditCard,
  onDeleteCard,
  onSetDirection,
  onOpenDesc,
  onPatchCard,
  onDuplicateCard,
  onPinCardToTop,
  activeDragIds,
  sprintBoardQuickActions,
  historicalCycleDays,
  isFinalColumn,
}: KanbanColumnCardListProps) {
  void _scrollRef;
  return (
    <>
      {cards.map((c, idx) => (
        <div
          key={c.id}
          className="flux-kanban-card-cv-wrap flex flex-col gap-1"
          data-flux-cv={useCv ? "1" : undefined}
        >
          <KanbanColumnDroppableSlot id={`slot-${bucketKey}-${idx}`} tall={tallSlots} />
          <KanbanCard
            cardId={c.id}
            bucketKey={bucketKey}
            directions={directions}
            dirColors={dirColors}
            onEdit={onEditCard}
            onDelete={onDeleteCard}
            onSetDirection={onSetDirection}
            onOpenDesc={onOpenDesc}
            tourFirstCard={!!isFirstColumn && idx === 0}
            buckets={boardBuckets}
            priorities={priorities}
            onPatchCard={onPatchCard}
            onDuplicateCard={onDuplicateCard}
            onPinToTop={onPinCardToTop}
            activeDragIds={activeDragIds}
            sprintBoardQuickActions={sprintBoardQuickActions}
            historicalCycleDays={historicalCycleDays}
            isFinalColumn={isFinalColumn}
          />
        </div>
      ))}
      <KanbanColumnDroppableSlot id={`slot-${bucketKey}-${cards.length}`} tall={tallSlots} />
    </>
  );
}

type KanbanColumnCardListOuterProps = KanbanColumnCardListProps & {
  columnEmpty: ReactNode;
  addCardFooter: ReactNode;
};

export function KanbanColumnCardList(props: KanbanColumnCardListOuterProps) {
  const { columnEmpty, addCardFooter, scrollRef, cards, ...cardListCore } = props;
  const useVirtual =
    KANBAN_COLUMN_VIRTUAL_ENABLED && cards.length >= KANBAN_COLUMN_CARD_CV_THRESHOLD;

  return (
    <>
      {cards.length === 0 ? columnEmpty : null}
      {cards.length > 0 && !useVirtual ? (
        <ClassicKanbanColumnCardList cards={cards} scrollRef={scrollRef} {...cardListCore} />
      ) : null}
      {cards.length > 0 && useVirtual ? (
        <VirtualKanbanColumnCardList scrollRef={scrollRef} cards={cards} {...cardListCore} />
      ) : null}
      {addCardFooter}
    </>
  );
}
