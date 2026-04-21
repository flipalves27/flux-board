import { getDb, isMongoConfigured } from "@/lib/mongo";
import type { Db } from "mongodb";

const COL = "digest_daily_send_lock";

let ensured = false;

async function ensureIndexes(db: Db): Promise<void> {
  if (ensured) return;
  await db.collection(COL).createIndex({ orgId: 1, userId: 1, dayKey: 1 }, { unique: true });
  ensured = true;
}

/**
 * Idempotência por usuário/org/dia (evita e-mail duplicado no cron diário).
 * @returns true se esta instância pode enviar (primeira a registrar).
 */
export async function tryAcquireDailyDigestSend(params: {
  orgId: string;
  userId: string;
  dayKey: string;
}): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  const db = await getDb();
  await ensureIndexes(db);
  try {
    await db.collection(COL).insertOne({
      orgId: params.orgId,
      userId: params.userId,
      dayKey: params.dayKey,
      createdAt: new Date(),
    });
    return true;
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? (e as { code?: number }).code : undefined;
    if (code === 11000) return false;
    throw e;
  }
}
