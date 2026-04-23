"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { KanbanCard } from "./kanban-card";
import { KanbanColumnDroppableSlot } from "./kanban-column-droppable-slot";
import type { KanbanColumnCardListProps } from "./kanban-column-card-list";

/** Space for final drop slot + gap before the “add card” footer (outside this component). */
const TAIL_RESERVE_PX = 72;

export function VirtualKanbanColumnCardList({
  scrollRef,
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
  const estimate = tallSlots ? 92 : 112;
  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimate,
    overscan: 6,
  });

  const innerHeight = virtualizer.getTotalSize() + TAIL_RESERVE_PX;

  return (
    <div className="relative w-full" style={{ height: innerHeight }}>
      {virtualizer.getVirtualItems().map((vi) => {
        const c = cards[vi.index];
        return (
          <div
            key={c.id}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 right-0 top-0 flex flex-col gap-1"
            style={{ transform: `translateY(${vi.start}px)` }}
          >
            <div className="flux-kanban-card-cv-wrap flex flex-col gap-1" data-flux-cv={useCv ? "1" : undefined}>
              <KanbanColumnDroppableSlot id={`slot-${bucketKey}-${vi.index}`} tall={tallSlots} />
              <KanbanCard
                cardId={c.id}
                bucketKey={bucketKey}
                directions={directions}
                dirColors={dirColors}
                onEdit={onEditCard}
                onDelete={onDeleteCard}
                onSetDirection={onSetDirection}
                onOpenDesc={onOpenDesc}
                tourFirstCard={!!isFirstColumn && vi.index === 0}
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
          </div>
        );
      })}
      <div
        className="absolute left-0 right-0 top-0 pt-1"
        style={{ transform: `translateY(${virtualizer.getTotalSize()}px)` }}
      >
        <KanbanColumnDroppableSlot id={`slot-${bucketKey}-${cards.length}`} tall={tallSlots} />
      </div>
    </div>
  );
}
