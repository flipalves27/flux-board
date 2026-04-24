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

function bucketAdvanceIndex(bucketKey: string, order: BucketConfig[]): number {
  if (!order.length) return 0;
  const idx = order.findIndex((b) => b.key === bucketKey);
  return idx >= 0 ? idx / Math.max(1, order.length - 1) : 0;
}

function directionScore(direction: string | null | undefined): number {
  const d = (direction ?? "").trim().toLowerCase();
  if (d === "priorizar") return 45;
  if (d === "reavaliar") return 28;
  if (d === "adiar") return 18;
  if (d === "cancelar") return 12;
  if (d === "manter") return 6;
  return 0;
}

/**
 * Ranqueamento determinístico para “fila de decisão” na vista executiva:
 * atraso, urgência, bloqueios, direção estratégica, progresso e posição no fluxo.
 */
export function rankTopExecutiveDecisionCards(
  cards: CardData[],
  buckets: BucketConfig[],
  options?: { limit?: number }
): CardData[] {
  const limit = Math.max(1, Math.min(20, options?.limit ?? 5));
  const open = cards.filter((c) => !isDone(c));

  const scored = open.map((c) => {
    const d = daysUntilDue(c.dueDate);
    const overdue = d !== null && d < 0;
    const urgent = c.priority === "Urgente";
    const high = c.priority === "Importante";
    const inProgress = c.progress === "Em andamento";
    const blocked = (c.blockedBy?.length ?? 0) > 0;
    const blockCount = c.blockedBy?.length ?? 0;
    const flow = bucketAdvanceIndex(c.bucket, buckets);

    let score = 0;
    if (urgent) score += 120;
    else if (high) score += 55;
    if (overdue) score += 95;
    else if (d !== null && d <= 2) score += 40 - d * 8;
    else if (d !== null && d <= 7) score += 22;
    if (blocked) score += 32 + Math.min(24, blockCount * 10);
    score += directionScore(c.direction);
    if (inProgress) score += 22;
    score += flow * 18;

    return { c, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const oa = a.c.order ?? 0;
    const ob = b.c.order ?? 0;
    if (oa !== ob) return oa - ob;
    return a.c.id.localeCompare(b.c.id);
  });

  return scored.slice(0, limit).map((x) => x.c);
}
