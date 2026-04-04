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

/** Campos para `POST .../presence` com `action: "drag_move"` (alinhado com `DragMoveSsePayload`). */
export type DragMovePostFields = {
  overKind: "bucket" | "slot" | "card";
  bucketKey?: string;
  slotIndex?: number;
  overCardId?: string;
};

const MAX_BUCKET_KEY_LEN = 200;

/**
 * Deriva `overKind` / ids a partir do id do droppable do dnd-kit (cards no Kanban).
 * `over` nulo ou ids desconhecidos → null (não enviar POST).
 */
export function buildDragMoveFieldsFromOverId(overId: string | null): DragMovePostFields | null {
  if (!overId) return null;
  if (overId.startsWith("bucket-")) {
    const bucketKey = overId.slice(7);
    if (!bucketKey || bucketKey.length > MAX_BUCKET_KEY_LEN) return null;
    return { overKind: "bucket", bucketKey };
  }
  const slot = parseSlotId(overId);
  if (slot) {
    if (slot.bucketKey.length > MAX_BUCKET_KEY_LEN) return null;
    return { overKind: "slot", bucketKey: slot.bucketKey, slotIndex: slot.index };
  }
  if (overId.startsWith("card-")) {
    const overCardId = overId.slice(5);
    if (!overCardId || overCardId.length > MAX_BUCKET_KEY_LEN) return null;
    return { overKind: "card", overCardId };
  }
  // Coluna sortable: id é a chave do bucket (sem prefixos).
  if (overId.length > 0 && overId.length <= MAX_BUCKET_KEY_LEN) {
    return { overKind: "bucket", bucketKey: overId };
  }
  return null;
}
