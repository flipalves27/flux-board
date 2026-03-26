import { useCallback, useMemo, useState } from "react";
import {
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
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

      const colIndex = buckets.findIndex((b) => b.key === activeIdStr);
      if (colIndex >= 0) {
        const overColIndex = buckets.findIndex((b) => b.key === overId);
        if (overColIndex >= 0 && overColIndex !== colIndex) {
          reorderColumns(colIndex, overColIndex);
        }
        return;
      }

      if (activeIdStr.startsWith("card-")) {
        const cardId = activeIdStr.replace("card-", "");
        const raw = active.data.current as { dragIds?: string[] } | undefined;
        const dragIds = raw?.dragIds?.length ? raw.dragIds : [cardId];
        const idSet = new Set(dragIds);
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
        const slotInfo = parseSlotId(overId);
        if (slotInfo) {
          const visibleDest = getCardsByBucket(slotInfo.bucketKey);
          const insertIndex = adjustSlotInsertIndexForBatch(slotInfo.index, visibleDest, idSet);
          moveCardsBatch(dragIds, slotInfo.bucketKey, insertIndex);
          return;
        }
        if (overId.startsWith("bucket-")) {
          const newBucket = overId.replace("bucket-", "");
          const bucketCards = getCardsByBucket(newBucket).filter((c) => !idSet.has(c.id));
          moveCardsBatch(dragIds, newBucket, bucketCards.length);
        }
      }
    },
    [buckets, cards, getCardsByBucket, moveCardsBatch, reorderColumns]
  );

  const activeCard =
    activeId && activeId.startsWith("card-") ? cards.find((c) => c.id === activeId.replace("card-", "")) : null;

  return {
    sensors,
    collisionDetection: closestCorners,
    activeId,
    handleDragStart,
    handleDragEnd,
    activeCard,
    activeDragCount: activeDragIds?.length ?? 1,
    activeDragIds,
    parseSlotId,
  };
}
