import type { CardData } from "@/app/board/[id]/page";

/** Ajusta o índice do slot após remover os cards em movimento da coluna de destino (ordem visível). */
export function adjustSlotInsertIndexForBatch(
  slotInsertIndex: number,
  visibleInDest: CardData[],
  movingIdSet: Set<string>
): number {
  let removedBefore = 0;
  for (let i = 0; i < visibleInDest.length && i < slotInsertIndex; i++) {
    if (movingIdSet.has(visibleInDest[i].id)) removedBefore++;
  }
  return slotInsertIndex - removedBefore;
}

export function parseSlotId(id: string): { bucketKey: string; index: number } | null {
  if (!id.startsWith("slot-")) return null;
  const rest = id.slice(5);
  const lastDash = rest.lastIndexOf("-");
  if (lastDash === -1) return null;
  const bucketKey = rest.slice(0, lastDash);
  const index = parseInt(rest.slice(lastDash + 1), 10);
  if (isNaN(index) || index < 0) return null;
  return { bucketKey, index };
}
