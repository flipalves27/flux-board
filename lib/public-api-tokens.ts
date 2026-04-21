import { createHash, randomBytes } from "crypto";
import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";
import type { PublicApiScope } from "./public-api-auth";

const COL_PUBLIC_API_TOKENS = "public_api_tokens";
const KV_PUBLIC_API_TOKENS = "public_api_tokens";

export type PublicApiTokenDoc = {
  _id: string;
  name: string;
  orgId: string;
  keyHash: string;
  keyPrefix: string;
  scopes: PublicApiScope[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  rotatedAt?: string | null;
  revokedAt?: string | null;
};

function mkId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

function normalizeScopes(scopes: PublicApiScope[]): PublicApiScope[] {
  return [...new Set(scopes)].sort();
}

export function hashPublicApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function keyPrefixOf(key: string): string {
  return key.slice(0, Math.min(8, key.length));
}

export function generatePublicApiKey(): string {
  return `fb_pk_${randomBytes(24).toString("hex")}`;
}

export async function listPublicApiTokens(): Promise<PublicApiTokenDoc[]> {
  if (!isMongoConfigured()) {
    const store = await getStore();
    return (await store.get<PublicApiTokenDoc[]>(KV_PUBLIC_API_TOKENS)) ?? [];
  }
  const db = await getDb();
  return db.collection<PublicApiTokenDoc>(COL_PUBLIC_API_TOKENS).find({}).sort({ createdAt: -1 }).toArray();
}

export async function createPublicApiToken(input: {
  name: string;
  orgId: string;
  scopes: PublicApiScope[];
}): Promise<{ token: PublicApiTokenDoc; rawKey: string }> {
  const rawKey = generatePublicApiKey();
  const now = new Date().toISOString();
  const token: PublicApiTokenDoc = {
    _id: mkId("pat"),
    name: input.name.trim(),
    orgId: input.orgId.trim(),
    keyHash: hashPublicApiKey(rawKey),
    keyPrefix: keyPrefixOf(rawKey),
    scopes: normalizeScopes(input.scopes),
    active: true,
    createdAt: now,
    updatedAt: now,
    rotatedAt: null,
    revokedAt: null,
  };
  if (!isMongoConfigured()) {
    const store = await getStore();
    const current = (await store.get<PublicApiTokenDoc[]>(KV_PUBLIC_API_TOKENS)) ?? [];
    await store.set(KV_PUBLIC_API_TOKENS, [token, ...current]);
    return { token, rawKey };
  }
  const db = await getDb();
  await db.collection<PublicApiTokenDoc>(COL_PUBLIC_API_TOKENS).insertOne(token);
  return { token, rawKey };
}

export async function rotatePublicApiToken(id: string): Promise<{ token: PublicApiTokenDoc; rawKey: string } | null> {
  const list = await listPublicApiTokens();
  const existing = list.find((x) => x._id === id);
  if (!existing) return null;
  const rawKey = generatePublicApiKey();
  const now = new Date().toISOString();
  const next: PublicApiTokenDoc = {
    ...existing,
    keyHash: hashPublicApiKey(rawKey),
    keyPrefix: keyPrefixOf(rawKey),
    active: true,
    updatedAt: now,
    rotatedAt: now,
  };
  if (!isMongoConfigured()) {
    const store = await getStore();
    const current = (await store.get<PublicApiTokenDoc[]>(KV_PUBLIC_API_TOKENS)) ?? [];
    await store.set(
      KV_PUBLIC_API_TOKENS,
      current.map((x) => (x._id === id ? next : x))
    );
    return { token: next, rawKey };
  }
  const db = await getDb();
  await db.collection<PublicApiTokenDoc>(COL_PUBLIC_API_TOKENS).updateOne({ _id: id }, { $set: next });
  return { token: next, rawKey };
}

export async function revokePublicApiToken(id: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (!isMongoConfigured()) {
    const store = await getStore();
    const current = (await store.get<PublicApiTokenDoc[]>(KV_PUBLIC_API_TOKENS)) ?? [];
    let changed = false;
    const next = current.map((x) => {
      if (x._id !== id) return x;
      changed = true;
      return { ...x, active: false, revokedAt: now, updatedAt: now };
    });
    await store.set(KV_PUBLIC_API_TOKENS, next);
    return changed;
  }
  const db = await getDb();
  const res = await db
    .collection<PublicApiTokenDoc>(COL_PUBLIC_API_TOKENS)
    .updateOne({ _id: id }, { $set: { active: false, revokedAt: now, updatedAt: now } });
  return res.matchedCount > 0;
}

export async function findActivePublicApiTokenByKey(key: string): Promise<PublicApiTokenDoc | null> {
  const hash = hashPublicApiKey(key);
  if (!isMongoConfigured()) {
    const list = await listPublicApiTokens();
    return list.find((x) => x.active && x.keyHash === hash) ?? null;
  }
  const db = await getDb();
  return db.collection<PublicApiTokenDoc>(COL_PUBLIC_API_TOKENS).findOne({ keyHash: hash, active: true });
}

