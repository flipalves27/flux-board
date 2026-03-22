import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import { validateBoardWip, type WipCountCardLike } from "@/lib/board-wip";
import { computeBoardPortfolio, type PortfolioBoardLike } from "@/lib/board-portfolio-metrics";

const DAY_MS = 86400000;

function parseColumnEnteredMs(iso: string | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** Cards não concluídos há mais de `minDays` na mesma coluna (usa columnEnteredAt ou heurística fraca). */
export function listStagnantOpenCardIds(cards: CardData[], minDays: number, nowMs: number): string[] {
  const threshold = minDays * DAY_MS;
  const out: string[] = [];
  for (const c of cards) {
    if (c.progress === "Concluída") continue;
    const entered = parseColumnEnteredMs(c.columnEnteredAt);
    if (entered === null) continue;
    if (nowMs - entered >= threshold) out.push(c.id);
  }
  return out;
}

export function countOverdueOpenCards(cards: CardData[], nowMs: number): { count: number; ids: string[] } {
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const ids: string[] = [];
  for (const c of cards) {
    if (c.progress === "Concluída") continue;
    const d = c.dueDate?.trim();
    if (!d) continue;
    const due = new Date(`${d}T00:00:00`);
    if (Number.isNaN(due.getTime())) continue;
    if (due.getTime() < today.getTime()) ids.push(c.id);
  }
  return { count: ids.length, ids };
}

export function listBlockedCardIds(cards: CardData[]): string[] {
  return cards.filter((c) => c.progress !== "Concluída" && Array.isArray(c.blockedBy) && c.blockedBy.length > 0).map((c) => c.id);
}

export type WipBreachInfo = { bucketKey: string; count: number; limit: number; cardIds: string[] };

export function listWipBreaches(buckets: BucketConfig[], cards: CardData[]): WipBreachInfo[] {
  const limits = new Map<string, number>();
  for (const b of buckets) {
    if (typeof b.wipLimit === "number" && b.wipLimit > 0) limits.set(b.key, b.wipLimit);
  }
  if (limits.size === 0) return [];

  const byBucket = new Map<string, CardData[]>();
  for (const c of cards) {
    if (!byBucket.has(c.bucket)) byBucket.set(c.bucket, []);
    byBucket.get(c.bucket)!.push(c);
  }

  const out: WipBreachInfo[] = [];
  for (const [key, limit] of limits) {
    const inCol = byBucket.get(key) ?? [];
    if (inCol.length > limit) {
      out.push({
        bucketKey: key,
        count: inCol.length,
        limit,
        cardIds: inCol.map((c) => c.id),
      });
    }
  }
  return out;
}

export function boardWipValidationOk(buckets: BucketConfig[], cards: CardData[]): boolean {
  const r = validateBoardWip(buckets, cards as WipCountCardLike[]);
  return r.ok;
}

export function buildPortfolioSnapshot(db: PortfolioBoardLike) {
  return computeBoardPortfolio(db);
}

export type FlowInsightChipKind = "wip" | "blocked" | "stagnant" | "overdue" | "risk" | "portfolio";

export type FlowInsightChipModel = {
  kind: FlowInsightChipKind;
  id: string;
  cardIds: string[];
  /** Para i18n com parâmetros */
  values?: Record<string, number | string>;
};

export function buildFlowInsightChips(args: {
  cards: CardData[];
  buckets: BucketConfig[];
  lastUpdated: string;
  stagnantDays?: number;
  nowMs?: number;
}): FlowInsightChipModel[] {
  const nowMs = args.nowMs ?? Date.now();
  const stagnantDays = args.stagnantDays ?? 5;
  const chips: FlowInsightChipModel[] = [];

  const breaches = listWipBreaches(args.buckets, args.cards);
  if (breaches.length > 0) {
    const ids = [...new Set(breaches.flatMap((b) => b.cardIds))];
    chips.push({
      kind: "wip",
      id: "wip",
      cardIds: ids,
      values: { columns: breaches.length, cards: ids.length },
    });
  }

  const blockedIds = listBlockedCardIds(args.cards);
  if (blockedIds.length > 0) {
    chips.push({ kind: "blocked", id: "blocked", cardIds: blockedIds, values: { count: blockedIds.length } });
  }

  const stagnantIds = listStagnantOpenCardIds(args.cards, stagnantDays, nowMs);
  if (stagnantIds.length > 0) {
    chips.push({
      kind: "stagnant",
      id: "stagnant",
      cardIds: stagnantIds,
      values: { count: stagnantIds.length, days: stagnantDays },
    });
  }

  const overdue = countOverdueOpenCards(args.cards, nowMs);
  if (overdue.count > 0) {
    chips.push({
      kind: "overdue",
      id: "overdue",
      cardIds: overdue.ids,
      values: { count: overdue.count },
    });
  }

  const portfolio = computeBoardPortfolio({
    cards: args.cards,
    config: { bucketOrder: args.buckets },
    lastUpdated: args.lastUpdated,
  });
  if (portfolio.risco !== null && portfolio.risco < 55) {
    chips.push({
      kind: "risk",
      id: "risk",
      cardIds: [],
      values: { score: portfolio.risco },
    });
  }

  if (portfolio.throughput !== null && portfolio.throughput < 50 && args.cards.filter((c) => c.progress !== "Concluída").length >= 4) {
    chips.push({
      kind: "portfolio",
      id: "throughput",
      cardIds: [],
      values: { score: portfolio.throughput },
    });
  }

  return chips;
}
