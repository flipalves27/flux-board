/**
 * Uma única regra para: persistir `card.bucket`, contar WIP e validar transições.
 * - Se `bucket` é a key ou o label de uma coluna → grava/count usa essa key.
 * - Caso contrário → mesma regra que o persist: cai na **primeira** coluna do quadro.
 *
 * Sem isso, o KV pode ter label no card, o cliente reescrevia só pela key (`bucketKeys.has`),
 * e o servidor contava o prev pelo label — `prevN` e `nextN` divergiam (400 WIP falso).
 */

export type BucketColumnLike = { key: string; label?: string };

export function resolveBucketToColumnKey(cardBucket: string, buckets: BucketColumnLike[]): string {
  const raw = String(cardBucket ?? "").trim();
  const list = buckets.length > 0 ? buckets : [{ key: "Backlog", label: "Backlog" }];
  if (!raw) {
    const k = String(list[0]?.key ?? "").trim();
    return k.length > 0 ? k : "Backlog";
  }
  for (const b of list) {
    const k = String(b.key ?? "").trim();
    if (!k) continue;
    if (k === raw) return k;
    const lb = typeof b.label === "string" ? b.label.trim() : "";
    if (lb && lb === raw) return k;
  }
  const first = String(list[0]?.key ?? "").trim();
  return first.length > 0 ? first : "Backlog";
}
