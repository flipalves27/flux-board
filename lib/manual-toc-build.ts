import type { ManualToc, ManualTocItem } from "@/lib/manual-types";

/**
 * Puro; seguro de usar em "use client" (sem leitura de ficheiros).
 */
export function buildManualTocTree(toc: ManualToc): {
  roots: ManualTocItem[];
  byParent: Map<string | null, ManualTocItem[]>;
} {
  const items = [...toc.items].sort((a, b) => a.order - b.order);
  const byParent = new Map<string | null, ManualTocItem[]>();
  for (const it of items) {
    const k = it.parentId;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(it);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.order - b.order);
  }
  return { roots: byParent.get(null) ?? [], byParent };
}
