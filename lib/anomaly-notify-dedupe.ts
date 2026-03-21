import type { Db } from "mongodb";
import { COL_ANOMALY_NOTIFY_DEDUPE } from "@/lib/anomaly-collections";
import { ANOMALY_NOTIFY_DEDUPE_WINDOW_MS } from "@/lib/anomaly-board-settings";

let dedupeIndexesEnsured = false;

export async function ensureAnomalyNotifyDedupeIndexes(db: Db): Promise<void> {
  if (dedupeIndexesEnsured) return;
  await db
    .collection(COL_ANOMALY_NOTIFY_DEDUPE)
    .createIndex({ orgId: 1, key: 1 }, { unique: true });
  dedupeIndexesEnsured = true;
}

/** Returns true if we should skip outbound notification (48h hysteresis). */
export async function shouldSkipNotifyDueToDedupe(
  db: Db,
  orgId: string,
  key: string,
  nowMs: number
): Promise<boolean> {
  await ensureAnomalyNotifyDedupeIndexes(db);
  const row = await db.collection<{ lastSentAt?: string }>(COL_ANOMALY_NOTIFY_DEDUPE).findOne({ orgId, key });
  if (!row?.lastSentAt) return false;
  const t = new Date(row.lastSentAt).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t < ANOMALY_NOTIFY_DEDUPE_WINDOW_MS;
}

export async function recordAnomalyNotifySent(db: Db, orgId: string, key: string, sentAtIso: string): Promise<void> {
  await ensureAnomalyNotifyDedupeIndexes(db);
  await db.collection(COL_ANOMALY_NOTIFY_DEDUPE).updateOne(
    { orgId, key },
    { $set: { orgId, key, lastSentAt: sentAtIso } },
    { upsert: true }
  );
}
