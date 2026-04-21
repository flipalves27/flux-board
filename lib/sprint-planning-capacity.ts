/** Weekdays Mon–Fri between two calendar dates (inclusive), using UTC noon to avoid DST edges. */
export function countWeekdaysInclusive(startIso: string, endIso: string): number {
  const s = new Date(`${startIso.slice(0, 10)}T12:00:00.000Z`).getTime();
  const e = new Date(`${endIso.slice(0, 10)}T12:00:00.000Z`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  const dayMs = 86400000;
  let n = 0;
  for (let t = s; t <= e; t += dayMs) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/**
 * Rough story-point capacity: members × weekdays × focus (default 70%).
 * Used for planning alerts only — not a substitute for historical velocity.
 */
export function computeRoughCapacityPoints(params: {
  memberCount: number;
  sprintWeekdays: number;
  focusFactor?: number;
}): number {
  const f = params.focusFactor ?? 0.7;
  if (params.memberCount <= 0 || params.sprintWeekdays <= 0) return 0;
  return Math.max(0, Math.round(params.memberCount * params.sprintWeekdays * f));
}
