import { useCallback, useMemo, useState } from "react";
import {
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { adjustSlotInsertIndexForBatch, parseSlotId } from "../kanban-dnd-utils";

export { parseSlotId } from "../kanban-dnd-utils";

type UseBoardDndArgs = {
  buckets: BucketConfig[];
  cards: CardData[];
  getCardsByBucket: (bucketKey: string) => CardData[];
  moveCardsBatch: (orderedIds: string[], newBucket: string, newIndex: number) => void;
  reorderColumns: (fromIndex: number, toIndex: number) => void;
};

/**
 * Custom collision detection that wraps `closestCorners` but re-ranks results
 * so that card / slot / bucket-prefixed droppables are preferred over bare
 * sortable column ids when a *card* is being dragged.  This prevents the
 * column sortable rect (which covers the entire column) from "winning" over
 * the smaller card/slot droppables nested inside it.
 */
function buildCardAwareCollision(bucketKeys: Set<string>): CollisionDetection {
  return (args) => {
    const collisions = closestCorners(args);
    if (!collisions || collisions.length <= 1) return collisions;

    const activeId = String(args.active.id);
    const isDraggingCard = activeId.startsWith("card-");
    if (!isDraggingCard) return collisions;

    const preferred = collisions.filter((c) => {
      const id = String(c.id);
      return (
        id.startsWith("card-") ||
        id.startsWith("slot-") ||
        id.startsWith("bucket-")
      );
    });

    if (preferred.length > 0) return preferred;
    return collisions;
  };
}

export function useBoardDnd({
  buckets,
  cards,
  getCardsByBucket,
  moveCardsBatch,
  reorderColumns,
}: UseBoardDndArgs) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragIds, setActiveDragIds] = useState<string[] | null>(null);
  const coarsePointer = useCoarsePointer();

  const pointerActivation = useMemo(
    () =>
      coarsePointer
        ? { delay: 220, tolerance: 6 }
        : { distance: 8 },
    [coarsePointer]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: pointerActivation }),
    useSensor(KeyboardSensor)
  );

  const bucketKeysSig = buckets.map((b) => b.key).join("|");
  const collisionDetection: CollisionDetection = useMemo(() => {
    const keySet = new Set(buckets.map((b) => b.key));
    return buildCardAwareCollision(keySet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketKeysSig]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const idStr = String(e.active.id);
    setActiveId(idStr);
    const raw = e.active.data.current as { dragIds?: string[] } | undefined;
    const ids = raw?.dragIds;
    setActiveDragIds(ids?.length ? ids : null);
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      setActiveId(null);
      setActiveDragIds(null);
      if (!over) return;
      const overId = String(over.id);
      const activeIdStr = String(active.id);

      // --- Column reorder: only when dragging a column, never a card ---
      if (!activeIdStr.startsWith("card-")) {
        const colIndex = buckets.findIndex((b) => b.key === activeIdStr);
        if (colIndex >= 0) {
          const normalizedOver = overId.startsWith("bucket-")
            ? overId.replace("bucket-", "")
            : overId;
          const overColIndex = buckets.findIndex((b) => b.key === normalizedOver);
          if (overColIndex >= 0 && overColIndex !== colIndex) {
            reorderColumns(colIndex, overColIndex);
          }
        }
        return;
      }

      // --- Card drag ---
      const cardId = activeIdStr.replace("card-", "");
      const raw = active.data.current as { dragIds?: string[] } | undefined;
      const dragIds = raw?.dragIds?.length ? raw.dragIds : [cardId];
      const idSet = new Set(dragIds);

      // 1) Drop over another card
      if (overId.startsWith("card-")) {
        const overCardId = overId.replace("card-", "");
        if (!idSet.has(overCardId)) {
          const overCard = cards.find((c) => c.id === overCardId);
          if (overCard) {
            const visibleDest = getCardsByBucket(overCard.bucket);
            const overIndex = visibleDest.findIndex((c) => c.id === overCardId);
            if (overIndex >= 0) {
              const insertIndex = adjustSlotInsertIndexForBatch(overIndex, visibleDest, idSet);
              moveCardsBatch(dragIds, overCard.bucket, insertIndex);
              return;
            }
          }
        }
      }

      // 2) Drop on a slot between cards
      const slotInfo = parseSlotId(overId);
      if (slotInfo) {
        const visibleDest = getCardsByBucket(slotInfo.bucketKey);
        const insertIndex = adjustSlotInsertIndexForBatch(slotInfo.index, visibleDest, idSet);
        moveCardsBatch(dragIds, slotInfo.bucketKey, insertIndex);
        return;
      }

      // 3) Drop on the bucket droppable or on the column sortable id
      const normalizedBucket = overId.startsWith("bucket-")
        ? overId.replace("bucket-", "")
        : overId;
      const isBucketDrop = buckets.some((b) => b.key === normalizedBucket);
      if (isBucketDrop) {
        const newBucket = normalizedBucket;
        const bucketCards = getCardsByBucket(newBucket).filter((c) => !idSet.has(c.id));
        moveCardsBatch(dragIds, newBucket, bucketCards.length);
      }
    },
    [buckets, cards, getCardsByBucket, moveCardsBatch, reorderColumns]
  );

  const activeCard =
    activeId && activeId.startsWith("card-") ? cards.find((c) => c.id === activeId.replace("card-", "")) : null;

  return {
    sensors,
    collisionDetection,
    activeId,
    handleDragStart,
    handleDragEnd,
    activeCard,
    activeDragCount: activeDragIds?.length ?? 1,
    activeDragIds,
    parseSlotId,
  };
}
