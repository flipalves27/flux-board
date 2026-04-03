/**
 * Limites WIP por coluna (bucket). Contagem = todos os cards na coluna.
 */

import { resolveBucketToColumnKey } from "@/lib/board-bucket-resolve";

export type CardBucketLike = { id: string; bucket: string; order?: number };
export type BucketWipLike = { key: string; label?: string; wipLimit?: number | null };

/** Só `bucket` é usado na contagem WIP. */
export type WipCountCardLike = { bucket: string };

function wipColumnDisplayLabel(key: string, buckets: BucketWipLike[]): string {
  const bo = buckets.find((b) => b.key === key);
  const lb = bo?.label?.trim();
  return lb || key;
}

function bucketCounts(cards: WipCountCardLike[], buckets: BucketWipLike[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of cards) {
    const k = resolveBucketToColumnKey(c.bucket, buckets);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function collectWipLimits(buckets: BucketWipLike[]): Map<string, number> {
  const limits = new Map<string, number>();
  for (const b of buckets) {
    if (typeof b.wipLimit === "number" && Number.isFinite(b.wipLimit) && b.wipLimit > 0) {
      limits.set(b.key, Math.min(999, Math.floor(b.wipLimit)));
    }
  }
  return limits;
}

export function validateBoardWip(
  buckets: BucketWipLike[],
  cards: WipCountCardLike[]
): { ok: true } | { ok: false; message: string } {
  const limits = collectWipLimits(buckets);
  if (limits.size === 0) return { ok: true };

  const counts = bucketCounts(cards, buckets);
  for (const [key, limit] of limits) {
    const n = counts.get(key) ?? 0;
    if (n > limit) {
      const label = wipColumnDisplayLabel(key, buckets);
      return {
        ok: false,
        message: `Limite WIP (${limit}) excedido na coluna «${label}» (${n} cards).`,
      };
    }
  }
  return { ok: true };
}

/**
 * Validação WIP para PUT / mover cards quando o quadro **já está** acima do limite (dívida técnica).
 * - Coluna dentro do limite: aplica regra estrita (não pode ultrapassar o limite).
 * - Coluna já acima do limite: só rejeita se o número de cards **aumentar** (não permite piorar);
 *   permite reordenar, editar metadata e retirar cards até voltar à conformidade.
 */
export function validateBoardWipPutTransition(
  buckets: BucketWipLike[],
  prevCards: WipCountCardLike[],
  nextCards: WipCountCardLike[]
): { ok: true } | { ok: false; message: string } {
  const limits = collectWipLimits(buckets);
  if (limits.size === 0) return { ok: true };

  const prevC = bucketCounts(prevCards, buckets);
  const nextC = bucketCounts(nextCards, buckets);

  for (const [key, limit] of limits) {
    const prevN = prevC.get(key) ?? 0;
    const nextN = nextC.get(key) ?? 0;
    const label = wipColumnDisplayLabel(key, buckets);

    if (prevN > limit) {
      if (nextN > prevN) {
        return {
          ok: false,
          message: `A coluna «${label}» já está acima do WIP (${limit}); há ${prevN} cards. Remova cards desta coluna antes de adicionar novos.`,
        };
      }
      continue;
    }

    if (nextN > limit) {
      return {
        ok: false,
        message: `Limite WIP (${limit}) excedido na coluna «${label}» (${nextN} cards).`,
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
