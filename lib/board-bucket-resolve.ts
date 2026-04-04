/**
 * Uma única regra para: persistir `card.bucket`, contar WIP e validar transições.
 * - Se `bucket` é a key ou o label (ou alias) de uma coluna → grava/count usa essa key.
 * - Caso contrário → mesma regra que o persist: cai na **primeira** coluna do quadro.
 *
 * No servidor, funde `bucketOrder` do KV com o do PUT para reconhecer **labels antigos**
 * ainda gravados em `card.bucket` quando o utilizador renomeou a coluna no config — evita
 * `prevN` artificialmente baixo e 400 «Limite WIP excedido» ao guardar.
 */

export type BucketColumnLike = {
  key: string;
  label?: string;
  /** Sinónimos extra (geralmente preenchidos pelo merge servidor). */
  aliases?: string[];
  wipLimit?: number | null;
};

/** Comparação estável para bucket/label (acentos, etc. mantêm-se; unifica NFC). */
export function normBucketStr(s: string): string {
  return String(s ?? "").normalize("NFC").trim();
}

/**
 * Funde duas definições de colunas: mesma `key` acumula **todos** os labels vistos.
 * Ordem das colunas: primeiro `incoming` (payload), depois chaves só em `previous`.
 */
export function mergeBucketOrdersForWipResolve(
  previous: BucketColumnLike[],
  incoming: BucketColumnLike[]
): BucketColumnLike[] {
  const inc = incoming.length > 0 ? incoming : previous;
  if (previous.length === 0 && inc.length === 0) return [];

  const orderKeys: string[] = [];
  const seenNorm = new Set<string>();
  const pushKey = (rawKey: string) => {
    const k = String(rawKey ?? "").trim();
    if (!k) return;
    const n = normBucketStr(k);
    if (seenNorm.has(n)) return;
    seenNorm.add(n);
    orderKeys.push(k);
  };
  for (const b of inc) pushKey(String(b.key ?? ""));
  for (const b of previous) pushKey(String(b.key ?? ""));

  type Acc = {
    key: string;
    aliases: Set<string>;
    label?: string;
    wipLimit?: number | null;
  };
  const acc = new Map<string, Acc>();

  const ingest = (arr: BucketColumnLike[]) => {
    for (const b of arr) {
      const key = String(b.key ?? "").trim();
      if (!key) continue;
      const nk = normBucketStr(key);
      let row = acc.get(nk);
      if (!row) {
        row = { key, aliases: new Set() };
        acc.set(nk, row);
      }
      row.aliases.add(normBucketStr(key));
      const lb = typeof b.label === "string" ? normBucketStr(b.label) : "";
      if (lb) {
        row.aliases.add(lb);
        if (!row.label) row.label = typeof b.label === "string" ? b.label.trim() : lb;
      }
      if (Array.isArray(b.aliases)) {
        for (const a of b.aliases) {
          const m = normBucketStr(String(a));
          if (m) row.aliases.add(m);
        }
      }
      if (typeof b.wipLimit === "number" && Number.isFinite(b.wipLimit) && b.wipLimit > 0) {
        row.wipLimit = Math.min(999, Math.floor(b.wipLimit));
      }
    }
  };

  ingest(inc);
  ingest(previous);

  return orderKeys.map((k) => {
    const row = acc.get(normBucketStr(k));
    if (!row) return { key: k, label: k };
    const aliases = [...row.aliases].filter((a) => a && a !== normBucketStr(k));
    return {
      key: k,
      label: row.label?.trim() || k,
      ...(aliases.length > 0 ? { aliases } : {}),
      ...(typeof row.wipLimit === "number" ? { wipLimit: row.wipLimit } : {}),
    };
  });
}

export function resolveBucketToColumnKey(cardBucket: string, buckets: BucketColumnLike[]): string {
  const raw = normBucketStr(cardBucket);
  const list = buckets.length > 0 ? buckets : [{ key: "Backlog", label: "Backlog" }];
  if (!raw) {
    const k = String(list[0]?.key ?? "").trim();
    return k.length > 0 ? k : "Backlog";
  }
  for (const b of list) {
    const k = String(b.key ?? "").trim();
    if (!k) continue;
    const nk = normBucketStr(k);
    if (nk === raw) return k;
    const lb = typeof b.label === "string" ? normBucketStr(b.label) : "";
    if (lb && lb === raw) return k;
    if (Array.isArray(b.aliases)) {
      for (const a of b.aliases) {
        if (normBucketStr(String(a)) === raw) return k;
      }
    }
  }
  const first = String(list[0]?.key ?? "").trim();
  return first.length > 0 ? first : "Backlog";
}

export type CardBucketRef = { id?: string; bucket?: string };

/** `bucket` igual a key/label/alias de alguma coluna (não inferir como slug legado). */
export function columnTokenMatchesKnownColumn(raw: string, merged: BucketColumnLike[]): boolean {
  const n = normBucketStr(raw);
  if (!n) return false;
  for (const b of merged) {
    if (normBucketStr(b.key) === n) return true;
    if (b.label && normBucketStr(b.label) === n) return true;
    if (b.aliases?.some((a) => normBucketStr(String(a)) === n)) return true;
  }
  return false;
}

/**
 * Para cada string `prev.bucket` que, com o merge actual, cai no fallback errado:
 * se **todos** os cards com essa string (no prev) aparecem no `next` na **mesma** coluna K,
 * e o token não é nome de coluna conhecido, trata-o como alias de K.
 * Assim o `prevN` alinha com o que o cliente envia no PUT (ex.: slug só na BD).
 * Não promove "Backlog" → Dev quando toda a equipa move cards: esse token é coluna conhecida.
 */
export function expandBucketsWithInferredTransitionAliases(
  merged: BucketColumnLike[],
  prevCards: CardBucketRef[],
  nextCards: CardBucketRef[]
): BucketColumnLike[] {
  const prevById = new Map<string, CardBucketRef>();
  for (const c of prevCards) {
    const id = String(c.id ?? "").trim();
    if (id) prevById.set(id, c);
  }

  const byPrevRaw = new Map<string, Set<string>>();
  for (const n of nextCards) {
    const id = String(n.id ?? "").trim();
    if (!id) continue;
    const p = prevById.get(id);
    if (!p) continue;
    const raw = normBucketStr(String(p.bucket ?? ""));
    if (!raw) continue;
    const kn = resolveBucketToColumnKey(String(n.bucket ?? ""), merged);
    if (!byPrevRaw.has(raw)) byPrevRaw.set(raw, new Set());
    byPrevRaw.get(raw)!.add(kn);
  }

  const aliasAdds = new Map<string, Set<string>>();
  for (const [raw, kSet] of byPrevRaw) {
    if (kSet.size !== 1) continue;
    const onlyK = [...kSet][0];
    if (columnTokenMatchesKnownColumn(raw, merged)) continue;
    const kp = resolveBucketToColumnKey(raw, merged);
    if (kp === onlyK) continue;
    if (!aliasAdds.has(onlyK)) aliasAdds.set(onlyK, new Set());
    aliasAdds.get(onlyK)!.add(raw);
  }

  if (aliasAdds.size === 0) return merged;

  return merged.map((col) => {
    const add = aliasAdds.get(col.key);
    if (!add || add.size === 0) return col;
    const existing = new Set(
      [
        normBucketStr(col.key),
        ...(col.label ? [normBucketStr(col.label)] : []),
        ...((col.aliases ?? []).map((a) => normBucketStr(String(a))).filter(Boolean)),
      ].filter(Boolean)
    );
    const extra = [...add].filter((r) => r && !existing.has(r));
    if (extra.length === 0) return col;
    return { ...col, aliases: [...(col.aliases ?? []), ...extra] };
  });
}
