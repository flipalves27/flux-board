import crypto from "crypto";
import { getDb, isMongoConfigured } from "@/lib/mongo";

const COL = "flux_org_api_keys";

export function hashApiKey(plain: string): string {
  return crypto.createHash("sha256").update(String(plain).trim(), "utf8").digest("hex");
}

export type OrgApiKeyRecord = {
  id: string;
  orgId: string;
  name: string;
  keyHash: string;
  scopes: string[];
  rateLimitPerHour: number;
  active: boolean;
  createdBy?: string;
  lastUsedAt?: string | null;
  createdAt: string;
};

let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (!isMongoConfigured() || indexesEnsured) return;
  const db = await getDb();
  await db.collection(COL).createIndex({ keyHash: 1 }, { unique: true });
  await db.collection(COL).createIndex({ orgId: 1, active: 1 });
  indexesEnsured = true;
}

export async function resolveOrgFromV1ApiKey(apiKey: string | null): Promise<{
  orgId: string;
  scopes: string[];
  keyId: string;
} | null> {
  if (!apiKey?.trim() || !isMongoConfigured()) return null;
  await ensureIndexes();
  const db = await getDb();
  const keyHash = hashApiKey(apiKey);
  const doc = await db.collection<OrgApiKeyRecord>(COL).findOne({ keyHash, active: true });
  if (!doc) return null;
  void db.collection(COL).updateOne({ keyHash }, { $set: { lastUsedAt: new Date().toISOString() } });
  return { orgId: doc.orgId, scopes: doc.scopes ?? [], keyId: doc.id };
}
