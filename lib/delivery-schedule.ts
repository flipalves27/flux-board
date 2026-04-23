import type { BurndownSnapshot, SprintData } from "@/lib/schemas";
import {
  isCardDone,
  sprintScopeCardIds,
  toDayKey,
  type DeliveryCardLike,
  type DeliverySprintLike,
} from "@/lib/delivery-calendar";

export type ScheduleDateWindow = {
  startMs: number;
  endMs: number;
};

export function parseSprintDateMs(
  s: string | null | undefined
): number | null {
  if (s == null) return null;
  const k = toDayKey(s);
  if (!k) return null;
  return Date.parse(`${k}T00:00:00.000Z`);
}

/** Sprints with at least one of start/end parseable; others sort by name. */
export function sortSprintsForSchedule(sprints: readonly DeliverySprintLike[]): DeliverySprintLike[] {
  return [...sprints].sort((a, b) => {
    const aStart = parseSprintDateMs(a.startDate);
    const bStart = parseSprintDateMs(b.startDate);
    if (aStart != null && bStart != null) return aStart - bStart;
    if (aStart != null) return -1;
    if (bStart != null) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function burndownLatestRemaining(snapshots: readonly BurndownSnapshot[]): {
  at: string;
  remaining: number;
} | null {
  if (!snapshots.length) return null;
  const last = snapshots[snapshots.length - 1];
  if (last == null) return null;
  return { at: last.date, remaining: last.remainingCards };
}

export type ScheduleMilestone = {
  cardId: string;
  title: string;
  dueKey: string;
  dueMs: number;
  /** `due` outside sprint start/end (when both exist). */
  outOfSprintWindow: boolean;
  /** Other sprints this card is linked to. */
  alsoSprintNames: string[];
};

export type ScheduleSprintLane = {
  sprint: DeliverySprintLike;
  hasTimeline: boolean;
  startMs: number | null;
  endMs: number | null;
  /** % of scope (union cardIds+done) that have completedAt. */
  scopePct: number;
  /** doneCardIds in sprint data vs union scope (prefer card completion state for numerator when possible). */
  scopeTotal: number;
  scopeDoneCount: number;
  milestones: ScheduleMilestone[];
  /** Cards with completedAt within [window] (optional, for evolution strip). */
  completionsInWindow: { cardId: string; atMs: number }[];
  latestBurndown: ReturnType<typeof burndownLatestRemaining>;
};

export function cardCompletedMs(card: Pick<DeliveryCardLike, "completedAt">): number | null {
  if (!isCardDone(card)) return null;
  const t = Date.parse(String(card.completedAt));
  return Number.isNaN(t) ? null : t;
}

type BuildLanesOpts = {
  sprints: readonly DeliverySprintLike[];
  /** Full `SprintData` for burndown; optional. */
  fullSprints?: readonly SprintData[] | null;
  cards: readonly DeliveryCardLike[];
  window: ScheduleDateWindow;
};

export function buildScheduleSprintLanes(opts: BuildLanesOpts): { lanes: ScheduleSprintLane[]; unscheduled: DeliverySprintLike[] } {
  const { cards, window } = opts;
  const cardById = new Map(cards.map((c) => [c.id, c] as const));
  const sprints = sortSprintsForSchedule(opts.sprints);
  const byId = new Map((opts.fullSprints ?? []).map((s) => [s.id, s] as const));

  const lanes: ScheduleSprintLane[] = [];

  for (const sp of sprints) {
    const startMs = parseSprintDateMs(sp.startDate);
    const endMs = parseSprintDateMs(sp.endDate);
    const hasTimeline = startMs != null && endMs != null;

    const scope = sprintScopeCardIds(sp);
    const scopeTotal = Math.max(1, scope.size);
    let doneN = 0;
    for (const id of scope) {
      const c = cardById.get(id);
      if (c && isCardDone(c)) doneN += 1;
    }
    const scopePct = Math.round((doneN / scopeTotal) * 1000) / 10;

    const milestones: ScheduleMilestone[] = [];
    for (const id of scope) {
      const c = cardById.get(id);
      if (!c) continue;
      const dk = toDayKey(c.dueDate);
      if (!dk) continue;
      const dueMs = Date.parse(`${dk}T12:00:00.000Z`);
      if (Number.isNaN(dueMs)) continue;

      const outOfSprintWindow = Boolean(
        hasTimeline && startMs != null && endMs != null && (dueMs < startMs || dueMs > endMs)
      );
      const alsoSprintNames: string[] = [];
      for (const other of sprints) {
        if (other.id === sp.id) continue;
        if (sprintScopeCardIds(other).has(c.id)) alsoSprintNames.push(other.name);
      }
      milestones.push({
        cardId: c.id,
        title: c.title,
        dueKey: dk,
        dueMs,
        outOfSprintWindow: outOfSprintWindow,
        alsoSprintNames,
      });
    }
    milestones.sort((a, b) => a.dueMs - b.dueMs);

    const completionsInWindow: { cardId: string; atMs: number }[] = [];
    for (const id of scope) {
      const c = cardById.get(id);
      if (!c) continue;
      const m = cardCompletedMs(c);
      if (m == null) continue;
      if (m >= window.startMs && m <= window.endMs) {
        completionsInWindow.push({ cardId: c.id, atMs: m });
      }
    }
    completionsInWindow.sort((a, b) => a.atMs - b.atMs);

    const full = byId.get(sp.id);
    const latestBurndown = full?.burndownSnapshots?.length
      ? burndownLatestRemaining(full.burndownSnapshots)
      : null;

    lanes.push({
      sprint: sp,
      hasTimeline,
      startMs,
      endMs,
      scopePct,
      scopeTotal,
      scopeDoneCount: doneN,
      milestones,
      completionsInWindow,
      latestBurndown,
    });
  }

  const unscheduled = sprints.filter(
    (s) => parseSprintDateMs(s.startDate) == null || parseSprintDateMs(s.endDate) == null
  );
  return { lanes, unscheduled };
}

const WEEK_MS = 7 * 86_400_000;
const MON_MS = 30 * 86_400_000;

export type ScheduleZoom = "week" | "month";

/** Expands a symmetric window around `nowMs` for the timeline axis. */
export function buildDefaultScheduleWindow(
  nowMs: number,
  zoom: ScheduleZoom
): ScheduleDateWindow {
  const half = zoom === "week" ? 2 * WEEK_MS : 2 * MON_MS;
  return { startMs: nowMs - half, endMs: nowMs + half };
}

/**
 * `factor` in (0,1) zooms in; >1 zooms out (larger range).
 * Keeps the same center as `w`.
 */
export function zoomScheduleWindow(
  w: ScheduleDateWindow,
  factor: number
): ScheduleDateWindow {
  const c = (w.startMs + w.endMs) / 2;
  const half = ((w.endMs - w.startMs) / 2) * factor;
  return { startMs: c - half, endMs: c + half };
}

/**
 * For horizontal layout, returns 0..1 or null if lane has no range or time outside [start,end] of the lane.
 */
export function positionOnLane(
  tMs: number,
  startMs: number,
  endMs: number
): number | null {
  if (endMs <= startMs) return null;
  if (tMs < startMs || tMs > endMs) return null;
  return (tMs - startMs) / (endMs - startMs);
}

/**
 * For global axis [windowStart, windowEnd], 0..1.
 */
export function positionOnWindow(
  tMs: number,
  w: ScheduleDateWindow
): number | null {
  return positionOnLane(tMs, w.startMs, w.endMs);
}
