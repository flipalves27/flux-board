import type { DocData } from "./docs-types";
import { listDocsFlat } from "./kv-docs";

const DEFAULT_STALE_DAYS = 90;

function parseIso(s: string): number {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

export type DocumentHealthReport = {
  staleThresholdDays: number;
  nowIso: string;
  stats: {
    total: number;
    staleCount: number;
    noOwnerCount: number;
  };
  /** Oldest / riskiest first (by updatedAt asc among stale) */
  stale: DocData[];
  /** No owner (ownerUserId empty) */
  noOwner: DocData[];
};

export async function computeDocumentHealthReport(orgId: string, opts?: { staleDays?: number }): Promise<DocumentHealthReport> {
  const staleThresholdDays = typeof opts?.staleDays === "number" && opts.staleDays > 0 ? opts.staleDays : DEFAULT_STALE_DAYS;
  const all = await listDocsFlat(orgId);
  const cutoff = Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000;

  const stale = all
    .filter((d) => parseIso(d.updatedAt) < cutoff)
    .sort((a, b) => parseIso(a.updatedAt) - parseIso(b.updatedAt));
  const noOwner = all.filter((d) => !d.ownerUserId?.trim());

  return {
    staleThresholdDays,
    nowIso: new Date().toISOString(),
    stats: {
      total: all.length,
      staleCount: stale.length,
      noOwnerCount: noOwner.length,
    },
    stale: stale.slice(0, 100),
    noOwner: noOwner.slice(0, 100),
  };
}
