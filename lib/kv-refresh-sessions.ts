import crypto from "crypto";
import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";

const COL = "refresh_sessions";

export type RefreshSessionDoc = {
  _id: string;
  userId: string;
  orgId: string;
  familyId: string;
  /** Quando true, cookie de refresh usa maxAge (ex.: 7d); quando false, cookie de sessão do navegador. */
  persistent: boolean;
  expiresAt: Date;
  revoked: boolean;
};

const memory = new Map<string, RefreshSessionDoc>();

let indexesEnsured = false;

function hashToken(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

async function ensureIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection(COL).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection(COL).createIndex({ userId: 1, familyId: 1 });
  indexesEnsured = true;
}

function now(): Date {
  return new Date();
}

export async function createRefreshSession(params: {
  userId: string;
  orgId: string;
  familyId: string;
  persistent: boolean;
  expiresAt: Date;
}): Promise<{ plain: string }> {
  const plain = crypto.randomBytes(48).toString("base64url");
  const hid = hashToken(plain);
  const doc: RefreshSessionDoc = {
    _id: hid,
    userId: params.userId,
    orgId: params.orgId,
    familyId: params.familyId,
    persistent: params.persistent,
    expiresAt: params.expiresAt,
    revoked: false,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection<RefreshSessionDoc>(COL).insertOne(doc);
  } else {
    memory.set(hid, doc);
  }

  return { plain };
}

async function getDoc(hid: string): Promise<RefreshSessionDoc | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const d = await db.collection<RefreshSessionDoc>(COL).findOne({ _id: hid });
    return d;
  }
  return memory.get(hid) ?? null;
}

async function markRevoked(hid: string): Promise<void> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await db.collection<RefreshSessionDoc>(COL).updateOne({ _id: hid }, { $set: { revoked: true } });
  } else {
    const d = memory.get(hid);
    if (d) memory.set(hid, { ...d, revoked: true });
  }
}

/**
 * Valida o refresh opaco, revoga o registro (rotação / blacklist) e devolve metadados para emitir novos tokens.
 */
export async function consumeRefreshSessionForRotation(plain: string): Promise<{
  userId: string;
  orgId: string;
  familyId: string;
  persistent: boolean;
} | null> {
  if (!plain) return null;
  const hid = hashToken(plain);
  const doc = await getDoc(hid);
  if (!doc || doc.revoked || doc.expiresAt <= now()) {
    return null;
  }
  await markRevoked(hid);
  return {
    userId: doc.userId,
    orgId: doc.orgId,
    familyId: doc.familyId,
    persistent: doc.persistent ?? true,
  };
}

export async function revokeRefreshToken(plain: string): Promise<void> {
  if (!plain) return;
  const hid = hashToken(plain);
  await markRevoked(hid);
}
