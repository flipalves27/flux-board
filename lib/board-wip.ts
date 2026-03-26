/**
 * Limites WIP por coluna (bucket). Contagem = todos os cards na coluna.
 */

export type CardBucketLike = { id: string; bucket: string; order?: number };
export type BucketWipLike = { key: string; wipLimit?: number | null };

/** Só `bucket` é usado na contagem WIP. */
export type WipCountCardLike = { bucket: string };

export function validateBoardWip(
  buckets: BucketWipLike[],
  cards: WipCountCardLike[]
): { ok: true } | { ok: false; message: string } {
  const limits = new Map<string, number>();
  for (const b of buckets) {
    if (typeof b.wipLimit === "number" && Number.isFinite(b.wipLimit) && b.wipLimit > 0) {
      limits.set(b.key, Math.min(999, Math.floor(b.wipLimit)));
    }
  }
  if (limits.size === 0) return { ok: true };

  const counts = new Map<string, number>();
  for (const c of cards) {
    counts.set(c.bucket, (counts.get(c.bucket) ?? 0) + 1);
  }
  for (const [key, limit] of limits) {
    const n = counts.get(key) ?? 0;
    if (n > limit) {
      const label = buckets.find((b) => b.key === key)?.key ?? key;
      return {
        ok: false,
        message: `Limite WIP (${limit}) excedido na coluna «${label}» (${n} cards).`,
      };
    }
  }
  return { ok: true };
}

export function simulateMoveCardsBatch(
  cards: CardBucketLike[],
  orderedIds: string[],
  newBucket: string,
  insertIndex: number
): CardBucketLike[] {
  if (orderedIds.length === 0) return cards;
  const idSet = new Set(orderedIds);
  const moving = orderedIds.map((id) => cards.find((c) => c.id === id)).filter((c): c is CardBucketLike => Boolean(c));
  if (moving.length === 0) return cards;
  const without = cards.filter((c) => !idSet.has(c.id));
  const bucketCards = without
    .filter((c) => c.bucket === newBucket)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => ({ ...c }));
  const toInsert = moving.map((c) => ({ ...c, bucket: newBucket }));
  const safeIdx = Math.max(0, Math.min(insertIndex, bucketCards.length));
  bucketCards.splice(safeIdx, 0, ...toInsert);
  const reordered = bucketCards.map((c, i) => ({ ...c, order: i }));
  const otherBuckets = without.filter((c) => c.bucket !== newBucket);
  return [...otherBuckets, ...reordered];
}

export function simulateMoveSingleCard(
  cards: CardBucketLike[],
  cardId: string,
  newBucket: string,
  newIndex: number
): CardBucketLike[] {
  return simulateMoveCardsBatch(cards, [cardId], newBucket, newIndex);
}

export function simulatePatchBucketMove(
  cards: CardBucketLike[],
  cardId: string,
  targetBucket: string
): CardBucketLike[] {
  const card = cards.find((c) => c.id === cardId);
  if (!card || card.bucket === targetBucket) return cards;
  const withoutCard = cards.filter((c) => c.id !== cardId);
  const bucketCards = withoutCard
    .filter((c) => c.bucket === targetBucket)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => ({ ...c }));
  const merged = { ...card, bucket: targetBucket };
  bucketCards.push(merged);
  const reordered = bucketCards.map((c, i) => ({ ...c, order: i }));
  const otherBuckets = withoutCard.filter((c) => c.bucket !== targetBucket);
  return [...otherBuckets, ...reordered];
}
