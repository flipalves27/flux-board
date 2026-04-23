import type { SprintData } from "@/lib/schemas";

/** Minimal card shape for delivery planning (due dates, completion, assignment). */
export type DeliveryCardLike = {
  id: string;
  title: string;
  dueDate?: string | null;
  completedAt?: string | null;
  assigneeId?: string | null;
  progress?: string;
};

export type DeliverySprintLike = Pick<
  SprintData,
  "id" | "name" | "startDate" | "endDate" | "status" | "cardIds" | "doneCardIds"
>;

/** YYYY-MM-DD in UTC for the instant's calendar day (for stable comparisons in tests, pass `now`). */
export function dayKeyFromTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Parse `dueDate` / sprint dates: ISO or leading YYYY-MM-DD. Returns YYYY-MM-DD or null.
 */
export function toDayKey(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function startOfDayUtcFromKey(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`);
}

const DONE_PROGRESS_MARKERS = new Set(["Concluída", "Done", "Closed"]);

export function isCardDone(card: Pick<DeliveryCardLike, "completedAt" | "progress">): boolean {
  if (typeof card.completedAt === "string" && card.completedAt.trim().length) return true;
  return DONE_PROGRESS_MARKERS.has(String(card.progress ?? ""));
}

/** All cards referenced by a sprint (planned + done), deduped. */
export function sprintScopeCardIds(s: DeliverySprintLike): Set<string> {
  return new Set([...s.cardIds, ...s.doneCardIds]);
}

export function buildSprintCardIndex(
  sprints: DeliverySprintLike[]
): {
  cardIdToSprintIds: ReadonlyMap<string, readonly string[]>;
  sprintIdToCardIds: ReadonlyMap<string, readonly string[]>;
} {
  const cardIdToSprintIds = new Map<string, string[]>();
  const sprintIdToCardIds = new Map<string, string[]>();

  for (const sp of sprints) {
    const scope = sprintScopeCardIds(sp);
    const list = Array.from(scope);
    sprintIdToCardIds.set(sp.id, list);
    for (const cid of list) {
      const cur = cardIdToSprintIds.get(cid);
      if (cur) {
        if (!cur.includes(sp.id)) cur.push(sp.id);
      } else {
        cardIdToSprintIds.set(cid, [sp.id]);
      }
    }
  }

  return { cardIdToSprintIds, sprintIdToCardIds };
}

export function filterCardsForSprint(
  cards: readonly DeliveryCardLike[],
  sprint: DeliverySprintLike
): DeliveryCardLike[] {
  const scope = sprintScopeCardIds(sprint);
  return cards.filter((c) => scope.has(c.id));
}

/**
 * For a given year/month (1–12), map YYYY-MM-DD (day) → card ids on that day (dueDate anchor).
 * Uses each card’s due date only; completed cards are still listed on their due day for history (caller may filter).
 */
export function aggregateDueDatesByDayInMonth(
  cards: readonly DeliveryCardLike[],
  year: number,
  month1to12: number
): Map<string, string[]> {
  const byDay = new Map<string, string[]>();
  const prefix = `${String(year).padStart(4, "0")}-${String(month1to12).padStart(2, "0")}`;

  for (const c of cards) {
    const dk = toDayKey(c.dueDate);
    if (!dk || !dk.startsWith(prefix)) continue;
    const list = byDay.get(dk);
    if (list) list.push(c.id);
    else byDay.set(dk, [c.id]);
  }
  return byDay;
}

export type DeliveryBreach = "ok" | "overdue" | "due_soon" | "no_due" | "done";

export function classifyCardDelivery(
  card: DeliveryCardLike,
  todayKey: string,
  riskDays: number
): DeliveryBreach {
  if (isCardDone(card)) return "done";
  const dk = toDayKey(card.dueDate);
  if (!dk) return "no_due";
  if (dk < todayKey) return "overdue";
  const t0 = startOfDayUtcFromKey(todayKey);
  const t1 = startOfDayUtcFromKey(dk);
  const dayDiff = (t1 - t0) / 86_400_000;
  if (dayDiff >= 0 && dayDiff <= riskDays) return "due_soon";
  return "ok";
}

export type ManagerKpis = {
  todayKey: string;
  totalCards: number;
  withDue: number;
  noDue: number;
  done: number;
  active: number;
  overdue: number;
  dueSoon: number;
  /** When totalCards > 0, share of completed cards in scope. */
  pctComplete: number | null;
  /** When withDue > 0 among active, share of forecasted items with a due date. */
  forecastCoveragePct: number | null;
};

export function computeManagerKpis(
  cards: readonly DeliveryCardLike[],
  opts: { nowMs: number; riskDays: number; sprint?: DeliverySprintLike | null }
): ManagerKpis {
  const todayKey = dayKeyFromTime(opts.nowMs);
  const list = opts.sprint ? filterCardsForSprint(cards, opts.sprint) : [...cards];
  const totalCards = list.length;
  let withDue = 0;
  let noDue = 0;
  let done = 0;
  let overdue = 0;
  let dueSoon = 0;

  for (const c of list) {
    if (isCardDone(c)) {
      done += 1;
      continue;
    }
    const dk = toDayKey(c.dueDate);
    if (!dk) {
      noDue += 1;
      continue;
    }
    withDue += 1;
    const cls = classifyCardDelivery(c, todayKey, opts.riskDays);
    if (cls === "overdue") overdue += 1;
    else if (cls === "due_soon") dueSoon += 1;
  }

  const active = totalCards - done;
  const pctComplete = totalCards > 0 ? Math.round((done / totalCards) * 1000) / 10 : null;
  const forecastDen = withDue + noDue;
  const forecastCoveragePct =
    forecastDen > 0 ? Math.round((withDue / forecastDen) * 1000) / 10 : null;

  return {
    todayKey,
    totalCards,
    withDue,
    noDue,
    done,
    active,
    overdue,
    dueSoon,
    pctComplete,
    forecastCoveragePct,
  };
}

export type AssigneeManagerRow = {
  assigneeKey: string;
  displayLabel: string;
  total: number;
  done: number;
  overdue: number;
  dueSoon: number;
};

export function buildManagerByAssignee(
  cards: readonly DeliveryCardLike[],
  members: readonly { userId: string; username: string; name?: string }[],
  opts: { nowMs: number; riskDays: number; sprint?: DeliverySprintLike | null }
): AssigneeManagerRow[] {
  const list = opts.sprint ? filterCardsForSprint(cards, opts.sprint) : [...cards];
  const nameBy = new Map(members.map((m) => [m.userId, (m.name || m.username).trim() || m.username] as const));
  const todayKey = dayKeyFromTime(opts.nowMs);

  const byKey = new Map<string, { total: number; done: number; overdue: number; dueSoon: number }>();
  for (const c of list) {
    const k = c.assigneeId && String(c.assigneeId).trim() ? String(c.assigneeId) : "__unassigned__";
    const cur = byKey.get(k) ?? { total: 0, done: 0, overdue: 0, dueSoon: 0 };
    cur.total += 1;
    if (isCardDone(c)) cur.done += 1;
    else {
      const cl = classifyCardDelivery(c, todayKey, opts.riskDays);
      if (cl === "overdue") cur.overdue += 1;
      if (cl === "due_soon") cur.dueSoon += 1;
    }
    byKey.set(k, cur);
  }

  const rows: AssigneeManagerRow[] = [];
  for (const [assigneeKey, m] of byKey) {
    const displayLabel = assigneeKey === "__unassigned__" ? "—" : nameBy.get(assigneeKey) ?? assigneeKey;
    rows.push({ assigneeKey, displayLabel, total: m.total, done: m.done, overdue: m.overdue, dueSoon: m.dueSoon });
  }
  rows.sort((a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon || b.total - a.total);
  return rows;
}

export type SprintManagerRow = {
  sprintId: string;
  name: string;
  status: SprintData["status"];
  startKey: string | null;
  endKey: string | null;
  scopeTotal: number;
  scopeDone: number;
  overdue: number;
};

export function buildManagerSprintTable(
  sprints: readonly DeliverySprintLike[],
  cards: readonly DeliveryCardLike[],
  cardById: ReadonlyMap<string, DeliveryCardLike>,
  opts: { nowMs: number; riskDays: number }
): SprintManagerRow[] {
  const todayKey = dayKeyFromTime(opts.nowMs);
  const rows: SprintManagerRow[] = [];

  for (const s of sprints) {
    const scope = sprintScopeCardIds(s);
    let scopeDone = 0;
    let overdue = 0;
    for (const id of scope) {
      const c = cardById.get(id);
      if (!c) continue;
      if (isCardDone(c)) scopeDone += 1;
      else if (classifyCardDelivery(c, todayKey, opts.riskDays) === "overdue") overdue += 1;
    }
    rows.push({
      sprintId: s.id,
      name: s.name,
      status: s.status,
      startKey: toDayKey(s.startDate),
      endKey: toDayKey(s.endDate),
      scopeTotal: scope.size,
      scopeDone,
      overdue,
    });
  }
  return rows;
}

export type RiskCardItem = {
  card: DeliveryCardLike;
  reason: "overdue" | "due_soon";
  dueKey: string | null;
  sortKey: string;
};

/** Active cards that are overdue or due within `riskDays`, most urgent first. */
export function buildImmediateRiskList(
  cards: readonly DeliveryCardLike[],
  opts: { nowMs: number; riskDays: number; sprint?: DeliverySprintLike | null; limit?: number }
): RiskCardItem[] {
  const list = opts.sprint ? filterCardsForSprint(cards, opts.sprint) : [...cards];
  const todayKey = dayKeyFromTime(opts.nowMs);
  const out: RiskCardItem[] = [];

  for (const c of list) {
    if (isCardDone(c)) continue;
    const dk = toDayKey(c.dueDate);
    if (!dk) continue;
    const cl = classifyCardDelivery(c, todayKey, opts.riskDays);
    if (cl === "overdue") {
      out.push({ card: c, reason: "overdue", dueKey: dk, sortKey: dk });
    } else if (cl === "due_soon") {
      out.push({ card: c, reason: "due_soon", dueKey: dk, sortKey: dk });
    }
  }
  out.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "overdue" ? -1 : 1;
    return (a.sortKey || "").localeCompare(b.sortKey || "");
  });
  const lim = opts.limit ?? 50;
  return out.slice(0, lim);
}

export function makeCardLookup(cards: readonly DeliveryCardLike[]): Map<string, DeliveryCardLike> {
  return new Map(cards.map((c) => [c.id, c] as const));
}
