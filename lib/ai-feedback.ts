import { getDb, isMongoConfigured } from "@/lib/mongo";

const COL = "ai_feedback_events";

let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (!isMongoConfigured() || indexesEnsured) return;
  const db = await getDb();
  await db.collection(COL).createIndex({ orgId: 1, createdAt: -1 });
  await db.collection(COL).createIndex({ orgId: 1, feature: 1, createdAt: -1 });
  indexesEnsured = true;
}

export type AiFeedbackPayload = {
  orgId: string;
  userId: string;
  feature: string;
  vote: "up" | "down";
  /** Ex.: messageId do Copilot, cardId, etc. */
  targetId?: string;
  boardId?: string;
  meta?: Record<string, unknown>;
};

export async function insertAiFeedback(entry: AiFeedbackPayload): Promise<{ ok: boolean }> {
  if (!isMongoConfigured()) return { ok: false };
  try {
    await ensureIndexes();
    const db = await getDb();
    await db.collection(COL).insertOne({
      orgId: entry.orgId,
      userId: entry.userId,
      feature: entry.feature.slice(0, 80),
      vote: entry.vote,
      targetId: entry.targetId?.slice(0, 120) ?? null,
      boardId: entry.boardId?.slice(0, 80) ?? null,
      meta: entry.meta && typeof entry.meta === "object" ? entry.meta : null,
      createdAt: new Date().toISOString(),
    });
    return { ok: true };
  } catch (e) {
    console.warn("[ai_feedback]", e instanceof Error ? e.message : e);
    return { ok: false };
  }
}
