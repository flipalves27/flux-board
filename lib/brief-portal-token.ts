import { randomBytes } from "crypto";
import { getDb, isMongoConfigured } from "@/lib/mongo";

const COL = "brief_portal_tokens";

export type BriefPortalRecord = {
  _id: string;
  orgId: string;
  boardId: string;
  title: string;
  markdown: string;
  createdAt: Date;
  expiresAt: Date;
};

let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (!isMongoConfigured() || indexesEnsured) return;
  const db = await getDb();
  await db.collection(COL).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  indexesEnsured = true;
}

export async function createBriefPortalToken(params: {
  orgId: string;
  boardId: string;
  title: string;
  markdown: string;
  ttlDays?: number;
}): Promise<string | null> {
  if (!isMongoConfigured()) return null;
  await ensureIndexes();
  const db = await getDb();
  const token = randomBytes(24).toString("hex");
  const ttl = Math.min(Math.max(params.ttlDays ?? 7, 1), 30);
  const now = new Date();
  const expires = new Date(now.getTime() + ttl * 86400_000);
  const doc: BriefPortalRecord = {
    _id: token,
    orgId: params.orgId,
    boardId: params.boardId,
    title: params.title.slice(0, 200),
    markdown: params.markdown.slice(0, 120_000),
    createdAt: now,
    expiresAt: expires,
  };
  await db.collection<BriefPortalRecord>(COL).insertOne(doc);
  return token;
}

export async function getBriefPortalToken(token: string): Promise<BriefPortalRecord | null> {
  if (!isMongoConfigured() || !token) return null;
  await ensureIndexes();
  const db = await getDb();
  const doc = await db.collection<BriefPortalRecord>(COL).findOne({ _id: token });
  if (!doc) return null;
  const exp = doc.expiresAt instanceof Date ? doc.expiresAt.getTime() : new Date(doc.expiresAt as unknown as string).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return doc;
}
