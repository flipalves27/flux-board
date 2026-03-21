import { useCallback, useState } from "react";
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
import { parseSlotId } from "../kanban-dnd-utils";

export { parseSlotId } from "../kanban-dnd-utils";

type UseBoardDndArgs = {
  buckets: BucketConfig[];
  cards: CardData[];
  getCardsByBucket: (bucketKey: string) => CardData[];
  moveCard: (cardId: string, newBucket: string, newIndex: number) => void;
  reorderColumns: (fromIndex: number, toIndex: number) => void;
};

export function useBoardDnd({
  buckets,
  cards,
  getCardsByBucket,
  moveCard,
  reorderColumns,
}: UseBoardDndArgs) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((e: DragStartEvent) => setActiveId(String(e.active.id)), []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      setActiveId(null);
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
        const slotInfo = parseSlotId(overId);
        if (slotInfo) {
          const card = cards.find((c) => c.id === cardId);
          const sameBucket = card?.bucket === slotInfo.bucketKey;
          const dragIndex = card ? getCardsByBucket(card.bucket).findIndex((c) => c.id === cardId) : -1;
          let insertIndex = slotInfo.index;
          if (sameBucket && dragIndex >= 0 && dragIndex < insertIndex) insertIndex--;
          moveCard(cardId, slotInfo.bucketKey, insertIndex);
          return;
        }
        if (overId.startsWith("bucket-")) {
          const newBucket = overId.replace("bucket-", "");
          const bucketCards = getCardsByBucket(newBucket).filter((c) => c.id !== cardId);
          moveCard(cardId, newBucket, bucketCards.length);
        }
      }
    },
    [buckets, cards, getCardsByBucket, moveCard, reorderColumns]
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
    parseSlotId,
  };
}
