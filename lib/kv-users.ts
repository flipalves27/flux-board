import { getStore } from "./storage";
import { getDb, isMongoConfigured } from "./mongo";
import { hashPassword, verifyPassword } from "./auth";
import { DEFAULT_ORG_ID, ensureTenancyMigrationForExistingData, ensureDefaultOrganization } from "./kv-organizations";
import type { ThemePreference } from "./theme-storage";
import type { Db } from "mongodb";

const USERS_KEY = "reborn_users";
const USER_PREFIX = "reborn_user:";
const USER_BY_EMAIL = "reborn_user_email:";
const USER_BY_USERNAME = "reborn_user_username:";

const COL_USERS = "users";

const ADMIN_USER = {
  id: "admin",
  username: "Admin",
  name: "Admin",
  email: "admin@reborn.local",
  passwordHash: null as string | null,
  isAdmin: true,
  orgId: DEFAULT_ORG_ID,
};

export type { ThemePreference } from "./theme-storage";

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  passwordHash: string | null;
  isAdmin: boolean;
  orgId: string;
  themePreference?: ThemePreference;
  /** Quando true, o tour guiado do board não inicia mais automaticamente. */
  boardProductTourCompleted?: boolean;
}

type UserDoc = {
  _id: string;
  username: string;
  name: string;
  email: string;
  passwordHash: string | null;
  isAdmin: boolean;
  orgId: string;
  usernameLower: string;
  emailLower: string;
  themePreference?: ThemePreference;
  boardProductTourCompleted?: boolean;
};

function recreateAdminUser(): User {
  return {
    ...ADMIN_USER,
    passwordHash: hashPassword("Admin"),
  };
}

function toUser(doc: UserDoc): User {
  const tp = doc.themePreference;
  return {
    id: doc._id,
    username: doc.username,
    name: doc.name,
    email: doc.email,
    passwordHash: doc.passwordHash,
    isAdmin: !!doc.isAdmin,
    orgId: doc.orgId || DEFAULT_ORG_ID,
    ...(tp === "light" || tp === "dark" || tp === "system" ? { themePreference: tp } : {}),
    ...(doc.boardProductTourCompleted ? { boardProductTourCompleted: true } : {}),
  };
}

let userIndexesEnsured = false;

let tenancyMigrationEnsured = false;
async function ensureTenancyMigrationOnce(): Promise<void> {
  if (tenancyMigrationEnsured) return;
  await ensureTenancyMigrationForExistingData("admin");
  await ensureDefaultOrganization("admin");
  tenancyMigrationEnsured = true;
}

// Evita reads repetidos de inicializacao (em memoria por instância).
// TTL curto para ainda verificar periodicamente se precisa recriar algo.
const ENSURE_ADMIN_TTL_MS = Number(process.env.ENSURE_ADMIN_TTL_MS ?? 30_000);
let adminCache: { value: User; expiresAt: number } | null = null;
let ensureAdminPromise: Promise<User | null> | null = null;

async function ensureUserIndexes(db: Db): Promise<void> {
  if (userIndexesEnsured) return;
  const col = db.collection<UserDoc>(COL_USERS);
  await col.createIndex({ emailLower: 1 }, { unique: true });
  await col.createIndex({ usernameLower: 1 }, { unique: true });
  await col.createIndex({ orgId: 1 });
  userIndexesEnsured = true;
}

async function persistAdminUserMongo(db: Db, admin: User): Promise<void> {
  await ensureUserIndexes(db);
  const col = db.collection<UserDoc>(COL_USERS);
  await col.updateOne(
    { _id: "admin" },
    {
      $set: {
        username: admin.username,
        name: admin.name,
        email: admin.email,
        passwordHash: admin.passwordHash,
        isAdmin: true,
        usernameLower: admin.username.toLowerCase(),
        emailLower: admin.email.toLowerCase(),
        orgId: admin.orgId,
      },
    },
    { upsert: true }
  );
}

async function persistAdminUserKv(admin: User): Promise<void> {
  const kv = await getStore();
  await kv.set(USER_PREFIX + "admin", JSON.stringify(admin));
  await kv.set(USER_BY_USERNAME + "Admin".toLowerCase(), "admin");
  await kv.set(USER_BY_EMAIL + "admin@reborn.local".toLowerCase(), "admin");
  const users = ((await kv.get<string[]>(USERS_KEY)) as string[]) || [];
  if (!users.includes("admin")) {
    users.unshift("admin");
    await kv.set(USERS_KEY, users);
  }
}

export async function ensureAdminUser(): Promise<User | null> {
  // Migra esquema multi-tenancy quando necessário.
  await ensureTenancyMigrationForExistingData("admin");
  await ensureDefaultOrganization("admin");

  if (adminCache && Date.now() < adminCache.expiresAt) return adminCache.value;
  if (ensureAdminPromise) return ensureAdminPromise;

  ensureAdminPromise = (async () => {
  if (isMongoConfigured()) {
    const db = await getDb();
    const col = db.collection<UserDoc>(COL_USERS);
    await ensureUserIndexes(db);
    const raw = await col.findOne({ _id: "admin" });
    if (raw) {
      const existing = toUser(raw);
      const needsRecreate =
        !existing.isAdmin ||
        !existing.passwordHash ||
        !verifyPassword("Admin", existing.passwordHash);
      if (needsRecreate) {
        const admin = recreateAdminUser();
        await persistAdminUserMongo(db, admin);
        return admin;
      }
        if (!existing.orgId) {
          await col.updateOne({ _id: "admin" }, { $set: { orgId: DEFAULT_ORG_ID } });
          const updated = await col.findOne({ _id: "admin" });
          return updated ? toUser(updated) : existing;
        }
      return existing;
    }
    const admin = recreateAdminUser();
    await persistAdminUserMongo(db, admin);
    return admin;
  }

  const kv = await getStore();
  const raw = await kv.get<string>(USER_PREFIX + "admin");
  if (raw) {
    const existing = (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
    const needsRecreate =
      !existing.isAdmin ||
      !existing.passwordHash ||
      !verifyPassword("Admin", existing.passwordHash);

    if (needsRecreate) {
      const admin = recreateAdminUser();
      await persistAdminUserKv(admin);
      return admin;
    }
      if (!existing.orgId) {
        const admin = { ...existing, orgId: DEFAULT_ORG_ID };
        await persistAdminUserKv(admin);
        return admin;
      }
    return existing;
  }

  const admin = recreateAdminUser();
  await persistAdminUserKv(admin);
  return admin;
  })();

  try {
    const result = await ensureAdminPromise;
    if (result) adminCache = { value: result, expiresAt: Date.now() + ENSURE_ADMIN_TTL_MS };
    return result;
  } finally {
    ensureAdminPromise = null;
  }
}

export async function getUserById(id: string, orgId: string): Promise<User | null> {
  await ensureTenancyMigrationOnce();
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const doc = await db.collection<UserDoc>(COL_USERS).findOne({ _id: id, orgId });
    return doc ? toUser(doc) : null;
  }
  const kv = await getStore();
  const raw = await kv.get<string>(USER_PREFIX + id);
  if (!raw) return null;
  const user = (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
  return user.orgId === orgId ? user : null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  await ensureTenancyMigrationOnce();
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const doc = await db
      .collection<UserDoc>(COL_USERS)
      .findOne({ usernameLower: (username || "").toLowerCase() });
    return doc ? toUser(doc) : null;
  }
  const kv = await getStore();
  const id = await kv.get<string>(USER_BY_USERNAME + (username || "").toLowerCase());
  if (!id) return null;
  const raw = await kv.get<string>(USER_PREFIX + id);
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureTenancyMigrationOnce();
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const doc = await db
      .collection<UserDoc>(COL_USERS)
      .findOne({ emailLower: (email || "").toLowerCase() });
    return doc ? toUser(doc) : null;
  }
  const kv = await getStore();
  const id = await kv.get<string>(USER_BY_EMAIL + (email || "").toLowerCase());
  if (!id) return null;
  const raw = await kv.get<string>(USER_PREFIX + id);
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
}

export async function createUser(user: {
  username: string;
  name: string;
  email: string;
  passwordHash: string;
  orgId: string;
  isAdmin?: boolean;
}): Promise<User> {
  await ensureTenancyMigrationOnce();
  const id = "u_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  const doc: UserDoc = {
    _id: id,
    username: user.username,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    isAdmin: !!user.isAdmin,
    orgId: user.orgId || DEFAULT_ORG_ID,
    usernameLower: user.username.toLowerCase(),
    emailLower: user.email.toLowerCase(),
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    await db.collection<UserDoc>(COL_USERS).insertOne(doc);
    return toUser(doc);
  }

  const kv = await getStore();
  const u: User = toUser(doc);
  await kv.set(USER_PREFIX + id, JSON.stringify(u));
  await kv.set(USER_BY_USERNAME + user.username.toLowerCase(), id);
  await kv.set(USER_BY_EMAIL + user.email.toLowerCase(), id);
  const users = ((await kv.get<string[]>(USERS_KEY)) as string[]) || [];
  users.push(id);
  await kv.set(USERS_KEY, users);
  return u;
}

export async function updateUser(id: string, orgId: string, updates: Partial<User>): Promise<User | null> {
  await ensureTenancyMigrationOnce();
  const user = await getUserById(id, orgId);
  if (!user) return null;

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const col = db.collection<UserDoc>(COL_USERS);
    const $set: Partial<UserDoc> = {};
    if (updates.username !== undefined) {
      $set.username = updates.username;
      $set.usernameLower = updates.username.toLowerCase();
    }
    if (updates.email !== undefined) {
      $set.email = updates.email;
      $set.emailLower = updates.email.toLowerCase();
    }
    if (updates.name !== undefined) $set.name = updates.name;
    if (updates.passwordHash !== undefined) $set.passwordHash = updates.passwordHash;
    if (updates.themePreference !== undefined) {
      const tp = updates.themePreference;
      if (tp === "light" || tp === "dark" || tp === "system") {
        $set.themePreference = tp;
      }
    }
    if (updates.boardProductTourCompleted !== undefined) {
      $set.boardProductTourCompleted = !!updates.boardProductTourCompleted;
    }
    // `orgId` não deve ser alterado por este endpoint (evita troca de tenant por engano).
    if (Object.keys($set).length) await col.updateOne({ _id: id, orgId }, { $set });
    return getUserById(id, orgId);
  }

  const kv = await getStore();
  if (updates.username !== undefined) {
    await kv.del(USER_BY_USERNAME + user.username.toLowerCase());
    user.username = updates.username;
    await kv.set(USER_BY_USERNAME + user.username.toLowerCase(), id);
  }
  if (updates.email !== undefined) {
    await kv.del(USER_BY_EMAIL + user.email.toLowerCase());
    user.email = updates.email;
    await kv.set(USER_BY_EMAIL + user.email.toLowerCase(), id);
  }
  if (updates.name !== undefined) user.name = updates.name;
  if (updates.passwordHash !== undefined) user.passwordHash = updates.passwordHash;
  if (updates.themePreference !== undefined) {
    const tp = updates.themePreference;
    if (tp === "light" || tp === "dark" || tp === "system") {
      user.themePreference = tp;
    }
  }
  if (updates.boardProductTourCompleted !== undefined) {
    user.boardProductTourCompleted = !!updates.boardProductTourCompleted;
  }
  await kv.set(USER_PREFIX + id, JSON.stringify(user));
  return user;
}

export async function listUsers(orgId: string): Promise<
  { id: string; username: string; name: string; email: string; isAdmin: boolean }[]
> {
  await ensureTenancyMigrationOnce();
  await ensureAdminUser();
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const docs = await db
      .collection<UserDoc>(COL_USERS)
      .find({ orgId })
      .sort({ usernameLower: 1 })
      .toArray();
    return docs.map((u) => ({
      id: u._id,
      username: u.username,
      name: u.name,
      email: u.email,
      isAdmin: !!u.isAdmin,
    }));
  }
  const kv = await getStore();
  const ids = ((await kv.get<string[]>(USERS_KEY)) as string[]) || [];
  const users = [];
  for (const id of ids) {
    const raw = await kv.get<string>(USER_PREFIX + id);
    if (!raw) continue;
    const u = (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
    if (u?.orgId !== orgId) continue;
    users.push({ id: u.id, username: u.username, name: u.name, email: u.email, isAdmin: !!u.isAdmin });
  }
  return users;
}

export async function deleteUser(id: string, orgId: string): Promise<void> {
  await ensureTenancyMigrationOnce();
  const user = await getUserById(id, orgId);
  if (!user) return;

  if (isMongoConfigured()) {
    const db = await getDb();
    await db.collection<UserDoc>(COL_USERS).deleteOne({ _id: id, orgId });
    return;
  }

  const kv = await getStore();
  await kv.del(USER_PREFIX + id);
  await kv.del(USER_BY_EMAIL + (user.email || "").toLowerCase());
  await kv.del(USER_BY_USERNAME + (user.username || "").toLowerCase());
  const users = ((await kv.get<string[]>(USERS_KEY)) as string[]) || [];
  await kv.set(
    USERS_KEY,
    users.filter((u) => u !== id)
  );
}
