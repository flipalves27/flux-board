import { createHash } from "node:crypto";
import { getDb, isMongoConfigured } from "@/lib/mongo";

const COL = "ai_completion_cache";

let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (!isMongoConfigured() || indexesEnsured) return;
  const db = await getDb();
  await db.collection(COL).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  indexesEnsured = true;
}

export function hashCacheKey(parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(String(p), "utf8");
  return h.digest("hex");
}

export async function getAiTextCache(keyHash: string): Promise<string | null> {
  if (!isMongoConfigured()) return null;
  try {
    await ensureIndexes();
    const db = await getDb();
    const doc = await db.collection<{ text: string; expiresAt: Date }>(COL).findOne({ _id: keyHash });
    if (!doc?.text) return null;
    return doc.text;
  } catch (e) {
    console.warn("[ai_completion_cache] get", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function setAiTextCache(keyHash: string, text: string, ttlSeconds: number): Promise<void> {
  if (!isMongoConfigured()) return;
  try {
    await ensureIndexes();
    const db = await getDb();
    const expiresAt = new Date(Date.now() + Math.max(60, ttlSeconds) * 1000);
    await db.collection(COL).updateOne(
      { _id: keyHash },
      { $set: { text: text.slice(0, 120_000), expiresAt, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (e) {
    console.warn("[ai_completion_cache] set", e instanceof Error ? e.message : e);
  }
}
