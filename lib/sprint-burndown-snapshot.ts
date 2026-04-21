import type { BurndownSnapshot } from "./schemas";

/** Replace same calendar day, sort by date, keep last 90 rows. */
export function mergeBurndownSnapshotRow(
  existing: readonly BurndownSnapshot[],
  row: BurndownSnapshot
): BurndownSnapshot[] {
  const map = new Map<string, BurndownSnapshot>();
  for (const s of existing) {
    map.set(s.date, s);
  }
  map.set(row.date, row);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
}
