import type { Db } from "mongodb";

/** Snapshots agregados por board/semana (sem atribuição individual). */
export const COL_BOARD_WEEKLY_SENTIMENT = "board_weekly_sentiment";

export type BoardWeeklySentimentDoc = {
  orgId: string;
  boardId: string;
  /** Alinhado ao digest: início da janela de 7 dias (ms). */
  weekStartMs: number;
  weekStartIso: string;
  score: number;
  category: "positive" | "neutral" | "negative";
  trend: "up" | "down" | "flat";
  trendDelta: number | null;
  recordedAt: string;
};

export async function ensureBoardWeeklySentimentIndexes(db: Db): Promise<void> {
  await db.collection(COL_BOARD_WEEKLY_SENTIMENT).createIndex({ orgId: 1, boardId: 1, weekStartMs: 1 }, { unique: true });
  await db.collection(COL_BOARD_WEEKLY_SENTIMENT).createIndex({ orgId: 1, weekStartMs: -1 });
}

export async function getSentimentScoreForBoardWeek(args: {
  db: Db;
  orgId: string;
  boardId: string;
  weekStartMs: number;
}): Promise<number | null> {
  const { db, orgId, boardId, weekStartMs } = args;
  const row = await db.collection<BoardWeeklySentimentDoc>(COL_BOARD_WEEKLY_SENTIMENT).findOne({
    orgId,
    boardId,
    weekStartMs,
  });
  return row && typeof row.score === "number" ? row.score : null;
}

export async function upsertBoardWeeklySentiment(args: {
  db: Db;
  doc: Omit<BoardWeeklySentimentDoc, "recordedAt"> & { recordedAt?: string };
}): Promise<void> {
  const { db, doc } = args;
  const recordedAt = doc.recordedAt ?? new Date().toISOString();
  await db.collection(COL_BOARD_WEEKLY_SENTIMENT).updateOne(
    { orgId: doc.orgId, boardId: doc.boardId, weekStartMs: doc.weekStartMs },
    {
      $set: {
        orgId: doc.orgId,
        boardId: doc.boardId,
        weekStartMs: doc.weekStartMs,
        weekStartIso: doc.weekStartIso,
        score: doc.score,
        category: doc.category,
        trend: doc.trend,
        trendDelta: doc.trendDelta,
        recordedAt,
      },
    },
    { upsert: true }
  );
}

export type OrgSentimentAggregatePoint = {
  weekStartIso: string;
  weekStartMs: number;
  avgScore: number;
  boardCount: number;
};

/**
 * Últimas semanas com snapshot (média org-wide por weekStartMs).
 */
export async function listOrgSentimentHistory(args: {
  db: Db;
  orgId: string;
  maxWeeks: number;
}): Promise<OrgSentimentAggregatePoint[]> {
  const { db, orgId, maxWeeks } = args;
  const rows = await db
    .collection<BoardWeeklySentimentDoc>(COL_BOARD_WEEKLY_SENTIMENT)
    .find({ orgId })
    .sort({ weekStartMs: -1 })
    .limit(400)
    .toArray();

  const byWeek = new Map<number, { sum: number; n: number; weekStartIso: string }>();
  for (const r of rows) {
    const prev = byWeek.get(r.weekStartMs);
    const iso = r.weekStartIso || new Date(r.weekStartMs).toISOString().slice(0, 10);
    if (!prev) {
      byWeek.set(r.weekStartMs, { sum: r.score, n: 1, weekStartIso: iso });
    } else {
      prev.sum += r.score;
      prev.n += 1;
    }
  }

  const sorted = [...byWeek.entries()].sort((a, b) => a[0] - b[0]);
  const slice = sorted.length > maxWeeks ? sorted.slice(-maxWeeks) : sorted;

  return slice.map(([weekStartMs, v]) => ({
    weekStartMs,
    weekStartIso: v.weekStartIso,
    avgScore: Math.round(v.sum / Math.max(1, v.n)),
    boardCount: v.n,
  }));
}
