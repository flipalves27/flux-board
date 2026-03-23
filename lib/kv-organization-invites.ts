import crypto from "crypto";
import { getStore } from "./storage";
import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";

export type OrganizationInvite = {
  _id: string; // token/code
  orgId: string;
  emailLower: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedByUserId?: string;
};

const COL_INVITES = "organization_invites";

function defaultExpiryDays(): number {
  const raw = process.env.FLUX_INVITE_EXPIRES_DAYS;
  const n = raw ? Number.parseInt(raw, 10) : 7;
  return Number.isFinite(n) && n > 0 ? n : 7;
}

function generateInviteCode(): string {
  return `inv_${crypto.randomBytes(12).toString("hex")}`;
}

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

const INVITE_PREFIX = "flux_org_invite:";
const INVITE_INDEX_PREFIX = "flux_org_invite_index:";

function inviteIndexKey(orgId: string): string {
  return `${INVITE_INDEX_PREFIX}${orgId}`;
}

function safeUniquePush(arr: string[], code: string): string[] {
  if (arr.includes(code)) return arr;
  arr.push(code);
  return arr;
}

async function ensureInviteIndexes(db: Db): Promise<void> {
  const col = db.collection<OrganizationInvite>(COL_INVITES);
  await col.createIndex({ expiresAt: 1 });
  await col.createIndex({ orgId: 1, emailLower: 1, expiresAt: 1 });
}

export async function createOrganizationInvite(params: { orgId: string; email: string }): Promise<OrganizationInvite> {
  const emailLower = normalizeEmail(params.email);
  if (!emailLower || !emailLower.includes("@")) throw new Error("E-mail inválido.");

  if (!isMongoConfigured()) {
    const code = generateInviteCode();
    const now = new Date();
    const inv: OrganizationInvite = {
      _id: code,
      orgId: params.orgId,
      emailLower,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + defaultExpiryDays() * 24 * 60 * 60 * 1000).toISOString(),
    };
    const kv = await getStore();
    await kv.set(INVITE_PREFIX + code, JSON.stringify(inv));
    const idx = ((await kv.get<string[]>(inviteIndexKey(params.orgId))) as string[]) ?? [];
    await kv.set(inviteIndexKey(params.orgId), safeUniquePush(idx, code));
    return inv;
  }

  const db = await getDb();
  await ensureInviteIndexes(db);
  const col = db.collection<OrganizationInvite>(COL_INVITES);

  const code = generateInviteCode();
  const now = new Date();
  const inv: OrganizationInvite = {
    _id: code,
    orgId: params.orgId,
    emailLower,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + defaultExpiryDays() * 24 * 60 * 60 * 1000).toISOString(),
  };

  await col.insertOne(inv);
  return inv;
}

export async function validateOrganizationInvite(params: { code: string; email: string }): Promise<{ orgId: string } | null> {
  const code = String(params.code || "").trim();
  const emailLower = normalizeEmail(params.email);
  if (!code || !emailLower) return null;

  const now = Date.now();

  if (!isMongoConfigured()) {
    const kv = await getStore();
    const raw = await kv.get<string>(INVITE_PREFIX + code);
    if (!raw) return null;
    const inv = (typeof raw === "string" ? JSON.parse(raw) : raw) as OrganizationInvite;
    if (inv.emailLower !== emailLower) return null;
    if (inv.usedAt) return null;
    if (new Date(inv.expiresAt).getTime() <= now) return null;
    return { orgId: inv.orgId };
  }

  const db = await getDb();
  await ensureInviteIndexes(db);
  const col = db.collection<OrganizationInvite>(COL_INVITES);
  const inv = await col.findOne({
    _id: code,
    emailLower,
  });
  if (!inv) return null;
  if (inv.usedAt) return null;
  if (new Date(inv.expiresAt).getTime() <= now) return null;
  return { orgId: inv.orgId };
}

export async function consumeOrganizationInvite(params: {
  code: string;
  email: string;
  userId: string;
}): Promise<boolean> {
  const code = String(params.code || "").trim();
  const emailLower = normalizeEmail(params.email);
  const userId = String(params.userId || "").trim();
  if (!code || !emailLower || !userId) return false;

  const now = new Date().toISOString();

  if (!isMongoConfigured()) {
    const kv = await getStore();
    const raw = await kv.get<string>(INVITE_PREFIX + code);
    if (!raw) return false;
    const inv = (typeof raw === "string" ? JSON.parse(raw) : raw) as OrganizationInvite;
    if (inv.emailLower !== emailLower) return false;
    if (inv.usedAt) return false;
    if (new Date(inv.expiresAt).getTime() <= Date.now()) return false;
    inv.usedAt = now;
    inv.usedByUserId = userId;
    await kv.set(INVITE_PREFIX + code, JSON.stringify(inv));
    return true;
  }

  const db = await getDb();
  await ensureInviteIndexes(db);
  const col = db.collection<OrganizationInvite>(COL_INVITES);

  const res = await col.updateOne(
    {
      _id: code,
      emailLower,
      usedAt: { $exists: false },
      expiresAt: { $gt: now },
    },
    { $set: { usedAt: now, usedByUserId: userId } }
  );

  return res.modifiedCount > 0;
}

export async function listOrganizationInvites(orgId: string): Promise<OrganizationInvite[]> {
  if (!isMongoConfigured()) {
    const kv = await getStore();
    const codes = ((await kv.get<string[]>(inviteIndexKey(orgId))) as string[]) ?? [];
    if (!codes.length) return [];
    const results = await Promise.all(
      codes.map(async (code) => {
        const raw = await kv.get<string>(INVITE_PREFIX + code);
        if (!raw) return null;
        const inv = (typeof raw === "string" ? JSON.parse(raw) : raw) as OrganizationInvite;
        return inv?.orgId === orgId ? inv : null;
      })
    );
    return results.filter((x): x is OrganizationInvite => Boolean(x));
  }

  const db = await getDb();
  await ensureInviteIndexes(db);
  const col = db.collection<OrganizationInvite>(COL_INVITES);
  return await col.find({ orgId }).sort({ createdAt: -1 }).toArray();
}

export async function revokeOrganizationInvite(params: { orgId: string; code: string }): Promise<boolean> {
  const orgId = params.orgId;
  const code = String(params.code || "").trim();
  if (!orgId || !code) return false;

  if (!isMongoConfigured()) {
    const kv = await getStore();
    const raw = await kv.get<string>(INVITE_PREFIX + code);
    if (!raw) return false;
    const inv = (typeof raw === "string" ? JSON.parse(raw) : raw) as OrganizationInvite;
    if (inv?.orgId !== orgId) return false;
    await kv.del(INVITE_PREFIX + code);
    const idx = ((await kv.get<string[]>(inviteIndexKey(orgId))) as string[]) ?? [];
    await kv.set(inviteIndexKey(orgId), idx.filter((c) => c !== code));
    return true;
  }

  const db = await getDb();
  await ensureInviteIndexes(db);
  const col = db.collection<OrganizationInvite>(COL_INVITES);
  const res = await col.deleteOne({ _id: code, orgId });
  return res.deletedCount > 0;
}

export async function countActiveOrganizationInvites(orgId: string): Promise<number> {
  const now = Date.now();
  if (!isMongoConfigured()) {
    const kv = await getStore();
    const codes = ((await kv.get<string[]>(inviteIndexKey(orgId))) as string[]) ?? [];
    if (!codes.length) return 0;
    let count = 0;
    for (const code of codes) {
      const raw = await kv.get<string>(INVITE_PREFIX + code);
      if (!raw) continue;
      const inv = (typeof raw === "string" ? JSON.parse(raw) : raw) as OrganizationInvite;
      if (inv?.orgId !== orgId) continue;
      if (inv.usedAt) continue;
      if (!inv.expiresAt) continue;
      if (new Date(inv.expiresAt).getTime() <= now) continue;
      count++;
    }
    return count;
  }

  const db = await getDb();
  await ensureInviteIndexes(db);
  const col = db.collection<OrganizationInvite>(COL_INVITES);
  return await col.countDocuments({
    orgId,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date(now).toISOString() },
  });
}

export async function expireOrganizationInvite(params: { orgId: string; code: string }): Promise<boolean> {
  const orgId = params.orgId;
  const code = String(params.code || "").trim();
  if (!orgId || !code) return false;

  if (!isMongoConfigured()) {
    const kv = await getStore();
    const raw = await kv.get<string>(INVITE_PREFIX + code);
    if (!raw) return false;
    const inv = (typeof raw === "string" ? JSON.parse(raw) : raw) as OrganizationInvite;
    if (inv?.orgId !== orgId) return false;
    if (inv.usedAt) return false;
    inv.expiresAt = new Date().toISOString();
    await kv.set(INVITE_PREFIX + code, JSON.stringify(inv));
    return true;
  }

  const db = await getDb();
  await ensureInviteIndexes(db);
  const col = db.collection<OrganizationInvite>(COL_INVITES);
  const res = await col.updateOne(
    { _id: code, orgId, usedAt: { $exists: false } },
    { $set: { expiresAt: new Date().toISOString() } }
  );
  return res.modifiedCount > 0;
}

