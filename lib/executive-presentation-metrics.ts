import type { BucketConfig, CardData } from "@/app/board/[id]/page";

function daysUntilDue(due: string | null | undefined): number | null {
  if (!due || typeof due !== "string") return null;
  const d = new Date(`${due.trim()}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function isDone(c: CardData) {
  return c.progress === "Concluída";
}

export type ExecutiveWipBucketRow = {
  key: string;
  label: string;
  count: number;
  limit: number;
  over: boolean;
};

export type ExecutivePresentationFlowMetrics = {
  wipRows: ExecutiveWipBucketRow[];
  columnsOverWip: number;
  bucketsWithWipLimit: number;
  overdueOpenCount: number;
  priorityCounts: { priority: string; count: number }[];
};

/**
 * Métricas derivadas de cards/buckets para a vista executiva (WIP vs limite, atrasos, prioridades).
 */
export function computeExecutiveFlowMetrics(
  buckets: BucketConfig[],
  openCards: CardData[]
): ExecutivePresentationFlowMetrics {
  const wipRows: ExecutiveWipBucketRow[] = [];
  let columnsOverWip = 0;
  let bucketsWithWipLimit = 0;

  for (const b of buckets) {
    const limit = b.wipLimit;
    if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) continue;
    bucketsWithWipLimit += 1;
    const count = openCards.filter((c) => c.bucket === b.key).length;
    const over = count > limit;
    if (over) columnsOverWip += 1;
    wipRows.push({ key: b.key, label: b.label, count, limit, over });
  }

  let overdueOpenCount = 0;
  const prioMap = new Map<string, number>();
  for (const c of openCards) {
    const d = daysUntilDue(c.dueDate);
    if (d !== null && d < 0) overdueOpenCount += 1;
    const p = (c.priority || "").trim() || "—";
    prioMap.set(p, (prioMap.get(p) ?? 0) + 1);
  }

  const priorityCounts = [...prioMap.entries()]
    .map(([priority, count]) => ({ priority, count }))
    .sort((a, b) => b.count - a.count);

  return { wipRows, columnsOverWip, bucketsWithWipLimit, overdueOpenCount, priorityCounts };
}

export function filterOpenCards(cards: CardData[], filterCard: (c: CardData) => boolean): CardData[] {
  return cards.filter((c) => filterCard(c) && !isDone(c));
}
