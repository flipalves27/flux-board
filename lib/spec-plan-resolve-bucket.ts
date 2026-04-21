export function resolveBucketKeyFromBoard(
  board: { config?: { bucketOrder?: unknown[] } },
  bucketKeyOrLabel?: string,
  bucketLabelOrKey?: string
): string | null {
  const bucketOrder = Array.isArray(board?.config?.bucketOrder) ? board.config.bucketOrder : [];
  const list = bucketOrder
    .filter((b: unknown) => b && typeof b === "object")
    .map((b: unknown) => {
      const o = b as { key?: unknown; label?: unknown };
      return { key: String(o.key || ""), label: String(o.label || "") };
    })
    .filter((b) => b.key);

  if (list.length === 0) return null;

  const byKey = list.find((b) => b.key.toLowerCase() === String(bucketKeyOrLabel || "").trim().toLowerCase());
  if (byKey) return byKey.key;

  const byLabel = list.find(
    (b) => b.label.toLowerCase() === String(bucketLabelOrKey || bucketKeyOrLabel || "").trim().toLowerCase()
  );
  if (byLabel) return byLabel.key;

  const raw = String(bucketLabelOrKey || bucketKeyOrLabel || "").trim().toLowerCase();
  if (!raw) return null;

  const labelIncludes = list.find((b) => b.label.toLowerCase().includes(raw));
  if (labelIncludes) return labelIncludes.key;

  const keyIncludes = list.find((b) => b.key.toLowerCase().includes(raw));
  if (keyIncludes) return keyIncludes.key;

  if (raw.length >= 2) {
    const rawIncludesLabel = list.find((b) => b.label.toLowerCase().length >= 2 && raw.includes(b.label.toLowerCase()));
    if (rawIncludesLabel) return rawIncludesLabel.key;

    const rawIncludesKey = list.find((b) => b.key.toLowerCase().length >= 2 && raw.includes(b.key.toLowerCase()));
    if (rawIncludesKey) return rawIncludesKey.key;
  }

  return null;
}

export function firstBucketKey(board: { config?: { bucketOrder?: unknown[] } }): string | null {
  const bucketOrder = Array.isArray(board?.config?.bucketOrder) ? board.config.bucketOrder : [];
  const first = bucketOrder.find((b: unknown) => b && typeof b === "object" && String((b as { key?: string }).key || "").trim());
  return first ? String((first as { key: string }).key) : null;
}

export function bucketOrderKeys(board: { config?: { bucketOrder?: unknown[] } }): string[] {
  const bucketOrder = Array.isArray(board?.config?.bucketOrder) ? board.config.bucketOrder : [];
  return bucketOrder
    .filter((b: unknown) => b && typeof b === "object")
    .map((b: unknown) => String((b as { key?: string }).key || "").trim())
    .filter(Boolean);
}

export function cardsSortedByBucket<T extends { bucket?: string; order?: number }>(cards: T[], bucketOrderKeysList: string[]): T[] {
  const bucketKeys = Array.from(new Set([...bucketOrderKeysList, ...cards.map((c) => String(c.bucket || ""))])).filter(Boolean);
  const next: T[] = [];
  for (const bk of bucketKeys) {
    const bucketCards = cards
      .filter((c) => String(c.bucket || "") === bk)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    bucketCards.forEach((c, i) => {
      (c as { order: number }).order = i;
    });
    next.push(...bucketCards);
  }
  return next;
}
