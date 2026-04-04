import { getStore } from "@/lib/storage";
import { getDb, isMongoConfigured } from "@/lib/mongo";

const PORTAL_PREFIX = "flux_portal:";
const COL_PORTAL_INDEX = "portal_links";

export type PortalIndexRecord = {
  token: string;
  boardId: string;
  orgId: string;
  enabled: boolean;
  updatedAt: string;
};

export async function upsertPortalIndex(record: PortalIndexRecord): Promise<void> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await db.collection(COL_PORTAL_INDEX).createIndex({ token: 1 }, { unique: true });
    await db.collection(COL_PORTAL_INDEX).replaceOne({ token: record.token }, record, { upsert: true });
    return;
  }

  const kv = await getStore();
  await kv.set(PORTAL_PREFIX + record.token, JSON.stringify(record));
}

export async function deletePortalIndex(token: string): Promise<void> {
  if (!token) return;
  if (isMongoConfigured()) {
    const db = await getDb();
    await db.collection(COL_PORTAL_INDEX).deleteOne({ token });
    return;
  }
  const kv = await getStore();
  await kv.del(PORTAL_PREFIX + token);
}

export async function getPortalIndexByToken(token: string): Promise<PortalIndexRecord | null> {
  if (!token) return null;
  if (isMongoConfigured()) {
    const db = await getDb();
    await db.collection(COL_PORTAL_INDEX).createIndex({ token: 1 }, { unique: true });
    const doc = await db.collection<PortalIndexRecord>(COL_PORTAL_INDEX).findOne({ token });
    return doc || null;
  }

  const kv = await getStore();
  const raw = await kv.get<string>(PORTAL_PREFIX + token);
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as PortalIndexRecord;
}
