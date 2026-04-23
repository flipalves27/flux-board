import { getStore } from "./storage";
import { getDb, isMongoConfigured } from "./mongo";
import { hashPassword, verifyPassword } from "./auth";
import { DEFAULT_ORG_ID, ensureTenancyMigrationForExistingData, ensureDefaultOrganization } from "./kv-organizations";
import type { ThemePreference } from "./theme-storage";
import type { OrgMembershipRole, OrgRole, PlatformRole } from "./rbac";
import { normalizeOrgMembershipRole, resolveCanonicalOrgMembershipRole } from "./rbac";
import type { Db } from "mongodb";

const USERS_KEY = "flux_users";
const USER_PREFIX = "flux_user:";
const USER_BY_EMAIL = "flux_user_email:";
const USER_BY_USERNAME = "flux_user_username:";
/** KV: flux_oauth_link:{provider}:{subject} → user id */
const OAUTH_LINK_PREFIX = "flux_oauth_link:";

const COL_USERS = "users";

const ADMIN_USER = {
  id: "admin",
  username: "Admin",
  name: "Admin",
  email: "admin@example.local",
  passwordHash: null as string | null,
  isAdmin: true,
  orgId: DEFAULT_ORG_ID,
  platformRole: "platform_admin" as PlatformRole,
  orgRole: "membro" as OrgMembershipRole,
};

export type { ThemePreference } from "./theme-storage";

export type OAuthProviderId = "google" | "microsoft";

export type OAuthLink = {
  provider: OAuthProviderId;
  /** Subject (`sub`) do IdP para este provedor */
  subject: string;
};

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  passwordHash: string | null;
  /** Contas vinculadas a provedores OAuth (login social). */
  oauthLinks?: OAuthLink[];
  isAdmin: boolean;
  /** Leitura executiva (C-level) sem permissões de administração da org. */
  isExecutive?: boolean;
  orgId: string;
  themePreference?: ThemePreference;
  /** Quando true, o tour guiado do board não inicia mais automaticamente. */
  boardProductTourCompleted?: boolean;
  platformRole?: PlatformRole;
  /** Papel na org (`gestor` | `membro` | `convidado`); valores legados `org_manager`/`org_member` são migrados. */
  orgRole?: OrgMembershipRole | OrgRole;
  /** Outras organizações em que o utilizador participa (além da org “principal” em `orgId`). */
  orgMemberships?: { orgId: string; orgRole: OrgMembershipRole; isAdmin?: boolean }[];
}

type UserDoc = {
  _id: string;
  username: string;
  name: string;
  email: string;
  passwordHash: string | null;
  isAdmin: boolean;
  isExecutive?: boolean;
  orgId: string;
  usernameLower: string;
  emailLower: string;
  themePreference?: ThemePreference;
  boardProductTourCompleted?: boolean;
  platformRole?: PlatformRole;
  orgRole?: string;
  oauthLinks?: { provider: string; subject: string }[];
  orgMemberships?: { orgId: string; orgRole: string; isAdmin?: boolean }[];
};

/**
 * Senha usada na criação/recriação do admin seed. Em dev, sem variáveis explícitas, cai no default "Admin".
 * Use `ADMIN_INITIAL_PASSWORD_B64` (UTF-8 em base64) se a senha tiver `$` e o loader de .env a alterar.
 */
function resolveAdminBootstrapPassword(): string {
  const b64 = process.env.ADMIN_INITIAL_PASSWORD_B64?.trim();
  if (b64) {
    return Buffer.from(b64, "base64").toString("utf8");
  }
  const p = process.env.ADMIN_INITIAL_PASSWORD?.trim();
  if (p) {
    return p;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[kv-users] ADMIN_INITIAL_PASSWORD (ou ADMIN_INITIAL_PASSWORD_B64) é obrigatório em produção para criar ou recriar o admin."
    );
  }
  return "Admin";
}

function hasExplicitAdminInitialPasswordInEnv(): boolean {
  return Boolean(
    process.env.ADMIN_INITIAL_PASSWORD_B64?.trim() || process.env.ADMIN_INITIAL_PASSWORD?.trim()
  );
}

/**
 * Em NODE_ENV != production, se a senha do admin no armazenamento não coincidir com a variável
 * de ambiente (quando explicitamente definida), atualiza o hash. Evita .env com nova senha sem
 * apagar o documento do admin; não corre em produção.
 */
async function resyncAdminPasswordIfEnvChanged(
  existing: User,
  persist: (admin: User) => Promise<void>
): Promise<User> {
  if (process.env.NODE_ENV === "production" || !hasExplicitAdminInitialPasswordInEnv()) {
    return existing;
  }
  if (existing.id !== "admin" || !existing.passwordHash) {
    return existing;
  }
  const plain = resolveAdminBootstrapPassword();
  if (verifyPassword(plain, existing.passwordHash)) {
    return existing;
  }
  const admin: User = { ...existing, passwordHash: hashPassword(plain) };
  await persist(admin);
  return admin;
}

function recreateAdminUser(): User {
  const plain = resolveAdminBootstrapPassword();
  return {
    ...ADMIN_USER,
    passwordHash: hashPassword(plain),
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
    ...(doc.isExecutive ? { isExecutive: true } : {}),
    ...(tp === "light" || tp === "dark" || tp === "system" ? { themePreference: tp } : {}),
    ...(doc.boardProductTourCompleted ? { boardProductTourCompleted: true } : {}),
    ...(doc.platformRole ? { platformRole: doc.platformRole as PlatformRole } : {}),
    ...(doc.orgRole ? { orgRole: doc.orgRole as User["orgRole"] } : {}),
    ...(doc.oauthLinks?.length
      ? {
          oauthLinks: doc.oauthLinks.filter(
            (l) =>
              (l.provider === "google" || l.provider === "microsoft") && typeof l.subject === "string"
          ) as OAuthLink[],
        }
      : {}),
    ...(doc.orgMemberships?.length
      ? {
          orgMemberships: doc.orgMemberships
            .filter((m) => m.orgId && m.orgRole)
            .map((m) => ({
              orgId: m.orgId,
              orgRole: normalizeOrgMembershipRole(m.orgRole, { isAdmin: !!m.isAdmin }) as OrgMembershipRole,
              ...(m.isAdmin ? { isAdmin: true } : {}),
            })),
        }
      : {}),
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
  await col.createIndex({ "orgMemberships.orgId": 1 });
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
        platformRole: "platform_admin",
        orgRole: "membro",
      },
    },
    { upsert: true }
  );
}

async function persistAdminUserKv(admin: User): Promise<void> {
  const kv = await getStore();
  await kv.set(USER_PREFIX + "admin", JSON.stringify(admin));
  await kv.set(USER_BY_USERNAME + "Admin".toLowerCase(), "admin");
  await kv.set(USER_BY_EMAIL + "admin@example.local".toLowerCase(), "admin");
  const users = ((await kv.get<string[]>(USERS_KEY)) as string[]) || [];
  if (!users.includes("admin")) {
    users.unshift("admin");
    await kv.set(USERS_KEY, users);
  }
}

export async function ensureAdminUser(): Promise<User | null> {
  if (adminCache && Date.now() < adminCache.expiresAt) return adminCache.value;
  if (ensureAdminPromise) return ensureAdminPromise;

  ensureAdminPromise = (async () => {
  // Migra esquema multi-tenancy quando necessário (após cache miss).
  await ensureTenancyMigrationForExistingData("admin");
  await ensureDefaultOrganization("admin");

  if (isMongoConfigured()) {
    const db = await getDb();
    const col = db.collection<UserDoc>(COL_USERS);
    await ensureUserIndexes(db);
    const raw = await col.findOne({ _id: "admin" });
    if (raw) {
      const existing = toUser(raw);
      // Não exigir a senha seed "Admin": senão qualquer alteração de senha é revertida no próximo ensureAdminUser().
      const needsRecreate = !existing.isAdmin || !existing.passwordHash;
      if (needsRecreate) {
        const admin = recreateAdminUser();
        await persistAdminUserMongo(db, admin);
        return admin;
      }
      const synced = await resyncAdminPasswordIfEnvChanged(existing, (a) => persistAdminUserMongo(db, a));
      if (!synced.orgId) {
        await col.updateOne({ _id: "admin" }, { $set: { orgId: DEFAULT_ORG_ID } });
        const updated = await col.findOne({ _id: "admin" });
        return updated ? toUser(updated) : synced;
      }
      return synced;
    }
    const admin = recreateAdminUser();
    await persistAdminUserMongo(db, admin);
    return admin;
  }

  const kv = await getStore();
  const raw = await kv.get<string>(USER_PREFIX + "admin");
  if (raw) {
    const existing = (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
    const needsRecreate = !existing.isAdmin || !existing.passwordHash;

    if (needsRecreate) {
      const admin = recreateAdminUser();
      await persistAdminUserKv(admin);
      return admin;
    }
    const synced = await resyncAdminPasswordIfEnvChanged(existing, (a) => persistAdminUserKv(a));
    if (!synced.orgId) {
      const admin = { ...synced, orgId: DEFAULT_ORG_ID };
      await persistAdminUserKv(admin);
      return admin;
    }
    return synced;
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

/** Utilizador global (todas as orgs); não filtra por tenant. */
export async function loadUserDocumentById(id: string): Promise<User | null> {
  await ensureTenancyMigrationOnce();
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const doc = await db.collection<UserDoc>(COL_USERS).findOne({ _id: id });
    return doc ? toUser(doc) : null;
  }
  const kv = await getStore();
  const raw = await kv.get<string>(USER_PREFIX + id);
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
}

export function resolveMembershipForOrg(
  user: User,
  orgId: string
): { orgRole: OrgMembershipRole; isAdmin: boolean } | null {
  if (user.orgId === orgId) {
    const orgRole = normalizeOrgMembershipRole(
      typeof user.orgRole === "string" ? user.orgRole : undefined,
      { isAdmin: !!user.isAdmin, isExecutive: !!user.isExecutive }
    );
    return { orgRole, isAdmin: !!user.isAdmin };
  }
  const extra = user.orgMemberships?.find((m) => m.orgId === orgId);
  if (!extra) return null;
  const orgRole = normalizeOrgMembershipRole(extra.orgRole, { isAdmin: !!extra.isAdmin });
  return { orgRole, isAdmin: !!extra.isAdmin };
}

/** @deprecated Preferir `getUserById`. */
export async function loadUserByIdFromStore(id: string, orgId: string): Promise<User | null> {
  return getUserById(id, orgId);
}

async function migrateUserCanonicalOrgRole(user: User): Promise<User> {
  if (user.id === "admin") return user;
  const rawSlot = user.orgRole as string | undefined;

  /** `listTeamMembers` só é necessário para elevar `membro` → `gestor` via Equipe (gestor org-scoped). */
  const needsTeamGestorLookup = (() => {
    if (rawSlot === "convidado" || rawSlot === "gestor" || rawSlot === "org_manager") return false;
    if (user.isAdmin || user.isExecutive) return false;
    if (rawSlot === "membro" || rawSlot === "org_member") return true;
    const prelim = normalizeOrgMembershipRole(typeof rawSlot === "string" ? rawSlot : undefined, {
      isAdmin: user.isAdmin,
      isExecutive: user.isExecutive,
    });
    return prelim === "membro";
  })();

  let teamGestor = false;
  if (needsTeamGestorLookup) {
    const { userIsActiveOrgTeamManager } = await import("./org-team-gestor");
    teamGestor = await userIsActiveOrgTeamManager(user.orgId, user.id);
  }

  const canonical = resolveCanonicalOrgMembershipRole(user, teamGestor);
  const needsPersist =
    rawSlot === "org_manager" ||
    rawSlot === "org_member" ||
    ((rawSlot === undefined || rawSlot === null || rawSlot === "") && canonical === "gestor") ||
    (rawSlot === "membro" && canonical === "gestor");
  const withCanonical = { ...user, orgRole: canonical };
  if (!needsPersist) return withCanonical;
  const updated = await updateUser(user.id, user.orgId, { orgRole: canonical });
  return updated ?? withCanonical;
}

export async function getUserById(id: string, orgId: string): Promise<User | null> {
  const base = await loadUserDocumentById(id);
  if (!base) return null;
  const m = resolveMembershipForOrg(base, orgId);
  if (!m) return null;
  const scoped: User = {
    ...base,
    orgId,
    orgRole: m.orgRole,
    isAdmin: m.isAdmin,
  };
  return migrateUserCanonicalOrgRole(scoped);
}

/** Carrega usuário por id sem filtrar por org (uso interno: OAuth, admin). */
export async function getUserRecordById(id: string): Promise<User | null> {
  await ensureTenancyMigrationOnce();
  let u: User | null = null;
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const doc = await db.collection<UserDoc>(COL_USERS).findOne({ _id: id });
    u = doc ? toUser(doc) : null;
  } else {
    const kv = await getStore();
    const raw = await kv.get<string>(USER_PREFIX + id);
    u = raw ? ((typeof raw === "string" ? JSON.parse(raw) : raw) as User) : null;
  }
  if (!u) return null;
  return migrateUserCanonicalOrgRole(u);
}

function oauthLinkKey(provider: OAuthProviderId, subject: string): string {
  return OAUTH_LINK_PREFIX + provider + ":" + subject;
}

async function setKvOAuthMappingsForUser(userId: string, links: OAuthLink[] | undefined): Promise<void> {
  if (!links?.length) return;
  const kv = await getStore();
  for (const l of links) {
    await kv.set(oauthLinkKey(l.provider, l.subject), userId);
  }
}

async function deleteKvOAuthMappingsForUser(user: User): Promise<void> {
  const links = user.oauthLinks;
  if (!links?.length) return;
  const kv = await getStore();
  for (const l of links) {
    await kv.del(oauthLinkKey(l.provider, l.subject));
  }
}

/** Primeiro usuário que possui o vínculo provider+subject. */
export async function findUserByOAuthProviderSubject(
  provider: OAuthProviderId,
  subject: string
): Promise<User | null> {
  await ensureTenancyMigrationOnce();
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const doc = await db.collection<UserDoc>(COL_USERS).findOne({
      oauthLinks: { $elemMatch: { provider, subject } },
    });
    return doc ? toUser(doc) : null;
  }
  const kv = await getStore();
  const id = await kv.get<string>(oauthLinkKey(provider, subject));
  if (!id) return null;
  const raw = await kv.get<string>(USER_PREFIX + id);
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
}

/**
 * Adiciona vínculo OAuth ao usuário. Retorna null se conflito (outro `sub` já ligado ao mesmo provider nesta conta,
 * ou vínculo já pertence a outro user id).
 */
export async function appendOAuthLink(
  userId: string,
  orgId: string,
  link: OAuthLink
): Promise<User | null> {
  const existingOwner = await findUserByOAuthProviderSubject(link.provider, link.subject);
  if (existingOwner && existingOwner.id !== userId) return null;

  const user = await getUserById(userId, orgId);
  if (!user) return null;

  const links = user.oauthLinks ?? [];
  const sameProvider = links.find((l) => l.provider === link.provider);
  if (sameProvider && sameProvider.subject !== link.subject) return null;

  if (links.some((l) => l.provider === link.provider && l.subject === link.subject)) {
    return user;
  }

  const nextLinks = [...links.filter((l) => l.provider !== link.provider), link];
  return updateUser(userId, orgId, { oauthLinks: nextLinks });
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
  passwordHash: string | null;
  orgId: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole;
  oauthLinks?: OAuthLink[];
}): Promise<User> {
  await ensureTenancyMigrationOnce();
  const id = "u_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  const initialOrgRole: OrgMembershipRole = normalizeOrgMembershipRole(
    typeof user.orgRole === "string" ? user.orgRole : undefined,
    { isAdmin: !!user.isAdmin, isExecutive: !!user.isExecutive }
  );
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
    ...(user.platformRole ? { platformRole: user.platformRole } : {}),
    orgRole: initialOrgRole,
    ...(user.oauthLinks?.length
      ? {
          oauthLinks: user.oauthLinks.map((l) => ({ provider: l.provider, subject: l.subject })),
        }
      : {}),
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
  await setKvOAuthMappingsForUser(id, u.oauthLinks);
  return u;
}

export async function updateUser(id: string, orgId: string, updates: Partial<User>): Promise<User | null> {
  await ensureTenancyMigrationOnce();
  const base = await loadUserDocumentById(id);
  if (!base || !resolveMembershipForOrg(base, orgId)) return null;

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
    if (updates.isExecutive !== undefined) {
      $set.isExecutive = !!updates.isExecutive;
    }
    if (updates.platformRole !== undefined) {
      $set.platformRole = updates.platformRole;
    }
    if (updates.oauthLinks !== undefined) {
      $set.oauthLinks = updates.oauthLinks.map((l) => ({ provider: l.provider, subject: l.subject }));
    }
    if (updates.isAdmin !== undefined || updates.orgRole !== undefined) {
      if (base.orgId === orgId) {
        if (updates.isAdmin !== undefined) $set.isAdmin = !!updates.isAdmin;
        if (updates.orgRole !== undefined) $set.orgRole = updates.orgRole;
      } else {
        const memberships = [...(base.orgMemberships ?? [])];
        const i = memberships.findIndex((m) => m.orgId === orgId);
        if (i < 0) return null;
        const cur = memberships[i]!;
        const nextRole =
          updates.orgRole !== undefined
            ? normalizeOrgMembershipRole(updates.orgRole, {
                isAdmin: updates.isAdmin ?? !!cur.isAdmin,
              })
            : normalizeOrgMembershipRole(cur.orgRole, { isAdmin: !!cur.isAdmin });
        const nextAdmin = updates.isAdmin !== undefined ? !!updates.isAdmin : !!cur.isAdmin;
        memberships[i] = {
          orgId: cur.orgId,
          orgRole: nextRole,
          ...(nextAdmin ? { isAdmin: true } : {}),
        };
        $set.orgMemberships = memberships;
      }
    }
    if (Object.keys($set).length) await col.updateOne({ _id: id }, { $set });
    return getUserById(id, orgId);
  }

  const kv = await getStore();
  const user = JSON.parse(JSON.stringify(base)) as User;
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
  if (updates.isExecutive !== undefined) {
    if (updates.isExecutive) user.isExecutive = true;
    else delete user.isExecutive;
  }
  if (updates.platformRole !== undefined) {
    user.platformRole = updates.platformRole;
  }
  if (updates.oauthLinks !== undefined) {
    await deleteKvOAuthMappingsForUser(user);
    user.oauthLinks = updates.oauthLinks;
    await setKvOAuthMappingsForUser(id, user.oauthLinks);
  }
  if (updates.isAdmin !== undefined || updates.orgRole !== undefined) {
    if (user.orgId === orgId) {
      if (updates.isAdmin !== undefined) user.isAdmin = !!updates.isAdmin;
      if (updates.orgRole !== undefined) user.orgRole = updates.orgRole;
    } else {
      const memberships = [...(user.orgMemberships ?? [])];
      const i = memberships.findIndex((m) => m.orgId === orgId);
      if (i < 0) return null;
      const cur = memberships[i]!;
      const nextRole =
        updates.orgRole !== undefined
          ? normalizeOrgMembershipRole(updates.orgRole, {
              isAdmin: updates.isAdmin ?? !!cur.isAdmin,
            })
          : normalizeOrgMembershipRole(cur.orgRole, { isAdmin: !!cur.isAdmin });
      const nextAdmin = updates.isAdmin !== undefined ? !!updates.isAdmin : !!cur.isAdmin;
      memberships[i] = {
        orgId: cur.orgId,
        orgRole: nextRole,
        ...(nextAdmin ? { isAdmin: true } : {}),
      };
      user.orgMemberships = memberships;
    }
  }
  await kv.set(USER_PREFIX + id, JSON.stringify(user));
  return getUserById(id, orgId);
}

/** Linha para listagens globais (admin da plataforma). */
export type PlatformUserListRow = {
  id: string;
  username: string;
  name: string;
  email: string;
  orgId: string;
  isAdmin: boolean;
  orgRole?: OrgMembershipRole | OrgRole;
  platformRole?: PlatformRole;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Lista todos os utilizadores com paginação. Com MongoDB: cursor estável por `_id`.
 * Sem Mongo: percorre o índice KV (capacidade limitada em dev).
 */
export async function listAllUsersPaginated(params: {
  limit: number;
  cursor?: string | null;
  orgId?: string;
  q?: string;
}): Promise<{ users: PlatformUserListRow[]; nextCursor: string | null; storage: "mongo" | "kv" }> {
  // Chamador deve invocar `ensureAdminUser()` antes (ex.: rota admin) para evitar dupla execução por pedido.
  const limit = Math.min(Math.max(1, params.limit || 50), 200);
  const q = (params.q || "").trim();
  const orgFilter = params.orgId?.trim() || undefined;

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const col = db.collection<UserDoc>(COL_USERS);
    const andParts: Record<string, unknown>[] = [];
    if (orgFilter) {
      andParts.push({
        $or: [{ orgId: orgFilter }, { orgMemberships: { $elemMatch: { orgId: orgFilter } } }],
      });
    }
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      andParts.push({ $or: [{ emailLower: rx }, { usernameLower: rx }, { name: rx }] });
    }
    if (params.cursor) {
      andParts.push({ _id: { $gt: params.cursor } });
    }
    const filter =
      andParts.length === 0 ? {} : andParts.length === 1 ? andParts[0]! : { $and: andParts };
    const docs = await col.find(filter).sort({ _id: 1 }).limit(limit + 1).toArray();
    const hasMore = docs.length > limit;
    const slice = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore && slice.length ? slice[slice.length - 1]._id : null;
    return {
      users: slice.map((u) => ({
        id: u._id,
        username: u.username,
        name: u.name,
        email: u.email,
        orgId: u.orgId || DEFAULT_ORG_ID,
        isAdmin: !!u.isAdmin,
        ...(u.orgRole ? { orgRole: u.orgRole as User["orgRole"] } : {}),
        ...(u.platformRole ? { platformRole: u.platformRole as PlatformRole } : {}),
      })),
      nextCursor,
      storage: "mongo",
    };
  }

  const kv = await getStore();
  const ids = ((await kv.get<string[]>(USERS_KEY)) as string[]) || [];
  const rows: PlatformUserListRow[] = [];
  for (const id of ids) {
    const raw = await kv.get<string>(USER_PREFIX + id);
    if (!raw) continue;
    const u = (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
    if (
      orgFilter &&
      u.orgId !== orgFilter &&
      !u.orgMemberships?.some((m) => m.orgId === orgFilter)
    ) {
      continue;
    }
    if (q) {
      const n = q.toLowerCase();
      const hay = `${u.name} ${u.email} ${u.username}`.toLowerCase();
      if (!hay.includes(n)) continue;
    }
    rows.push({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      orgId: u.orgId || DEFAULT_ORG_ID,
      isAdmin: !!u.isAdmin,
      ...(u.orgRole ? { orgRole: u.orgRole } : {}),
      ...(u.platformRole ? { platformRole: u.platformRole } : {}),
    });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  let start = 0;
  if (params.cursor) {
    const idx = rows.findIndex((r) => r.id > params.cursor!);
    start = idx === -1 ? rows.length : idx;
  }
  const page = rows.slice(start, start + limit);
  const nextCursor =
    start + limit < rows.length && page.length ? page[page.length - 1].id : null;
  return { users: page, nextCursor, storage: "kv" };
}

export async function countUsersInOrg(orgId: string): Promise<number> {
  await ensureTenancyMigrationOnce();
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    return db.collection<UserDoc>(COL_USERS).countDocuments({
      $or: [{ orgId }, { orgMemberships: { $elemMatch: { orgId } } }],
    });
  }
  const list = await listUsers(orgId);
  return list.length;
}

/**
 * Adiciona participação noutra organização sem remover a principal.
 */
export async function addOrgMembership(params: {
  userId: string;
  orgId: string;
  orgRole: OrgMembershipRole;
  isAdmin?: boolean;
}): Promise<User | null> {
  await ensureTenancyMigrationOnce();
  const { userId, orgId, orgRole } = params;
  const isAdmin = params.isAdmin ?? false;
  const base = await loadUserDocumentById(userId);
  if (!base) return null;
  if (resolveMembershipForOrg(base, orgId)) {
    return updateUser(userId, orgId, { orgRole, isAdmin });
  }
  const nextMemberships = [...(base.orgMemberships ?? [])];
  nextMemberships.push({ orgId, orgRole, ...(isAdmin ? { isAdmin: true } : {}) });

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    await db.collection<UserDoc>(COL_USERS).updateOne({ _id: userId }, { $set: { orgMemberships: nextMemberships } });
    return getUserById(userId, orgId);
  }

  const kv = await getStore();
  const u = JSON.parse(JSON.stringify(base)) as User;
  u.orgMemberships = nextMemberships;
  await kv.set(USER_PREFIX + userId, JSON.stringify(u));
  return getUserById(userId, orgId);
}

/** Todas as organizações em que o utilizador tem participação (principal + extras). */
export async function listMembershipOrgIdsForUser(userId: string): Promise<string[]> {
  const doc = await loadUserDocumentById(userId);
  if (!doc) return [];
  const ids = new Set<string>();
  if (doc.orgId) ids.add(doc.orgId);
  for (const m of doc.orgMemberships ?? []) {
    if (m.orgId) ids.add(m.orgId);
  }
  return Array.from(ids);
}

/** Remove uma org extra (não altera a org principal). */
export async function removeExtraOrgMembership(userId: string, orgId: string): Promise<boolean> {
  await ensureTenancyMigrationOnce();
  const base = await loadUserDocumentById(userId);
  if (!base || base.orgId === orgId) return false;
  const rest = (base.orgMemberships ?? []).filter((m) => m.orgId !== orgId);
  if (rest.length === (base.orgMemberships ?? []).length) return false;

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    await db.collection<UserDoc>(COL_USERS).updateOne({ _id: userId }, { $set: { orgMemberships: rest } });
    return true;
  }
  const kv = await getStore();
  const u = JSON.parse(JSON.stringify(base)) as User;
  u.orgMemberships = rest;
  await kv.set(USER_PREFIX + userId, JSON.stringify(u));
  return true;
}

/**
 * Move utilizador para outra organização (apenas chamadas autorizadas a nível de API).
 */
export async function moveUserToOrganization(userId: string, newOrgId: string): Promise<User | null> {
  await ensureTenancyMigrationOnce();
  const { getOrganizationById } = await import("./kv-organizations");
  const org = await getOrganizationById(newOrgId);
  if (!org) return null;

  const existing = await getUserRecordById(userId);
  if (!existing) return null;
  if (existing.orgMemberships?.length) return null;

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const col = db.collection<UserDoc>(COL_USERS);
    const r = await col.updateOne({ _id: userId }, { $set: { orgId: newOrgId } });
    if (r.matchedCount === 0) return null;
    return getUserById(userId, newOrgId);
  }

  const kv = await getStore();
  const raw = await kv.get<string>(USER_PREFIX + userId);
  if (!raw) return null;
  const user = (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
  user.orgId = newOrgId;
  await kv.set(USER_PREFIX + userId, JSON.stringify(user));
  return getUserById(userId, newOrgId);
}

export async function listUsers(orgId: string): Promise<
  {
    id: string;
    username: string;
    name: string;
    email: string;
    isAdmin: boolean;
    orgRole?: OrgMembershipRole | OrgRole;
  }[]
> {
  await ensureTenancyMigrationOnce();
  await ensureAdminUser();
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureUserIndexes(db);
    const docs = await db
      .collection<UserDoc>(COL_USERS)
      .find({
        $or: [{ orgId }, { orgMemberships: { $elemMatch: { orgId } } }],
      })
      .sort({ usernameLower: 1 })
      .toArray();
    const rows: {
      id: string;
      username: string;
      name: string;
      email: string;
      isAdmin: boolean;
      orgRole?: OrgMembershipRole | OrgRole;
    }[] = [];
    for (const d of docs) {
      const full = toUser(d);
      const m = resolveMembershipForOrg(full, orgId);
      if (!m) continue;
      rows.push({
        id: full.id,
        username: full.username,
        name: full.name,
        email: full.email,
        isAdmin: m.isAdmin,
        orgRole: m.orgRole,
      });
    }
    return rows;
  }
  const kv = await getStore();
  const ids = ((await kv.get<string[]>(USERS_KEY)) as string[]) || [];
  const users = [];
  for (const id of ids) {
    const raw = await kv.get<string>(USER_PREFIX + id);
    if (!raw) continue;
    const u = (typeof raw === "string" ? JSON.parse(raw) : raw) as User;
    const m = resolveMembershipForOrg(u, orgId);
    if (!m) continue;
    users.push({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      isAdmin: m.isAdmin,
      orgRole: m.orgRole,
    });
  }
  return users;
}

export async function deleteUser(id: string, orgId: string): Promise<void> {
  await ensureTenancyMigrationOnce();
  const doc = await loadUserDocumentById(id);
  if (!doc || !resolveMembershipForOrg(doc, orgId)) return;

  const extras = doc.orgMemberships ?? [];
  const isPrimary = doc.orgId === orgId;
  const onlyPrimary = isPrimary && extras.length === 0;

  if (onlyPrimary) {
    await deleteKvOAuthMappingsForUser(doc);
    if (isMongoConfigured()) {
      const db = await getDb();
      await db.collection<UserDoc>(COL_USERS).deleteOne({ _id: id });
      return;
    }
    const kv = await getStore();
    await kv.del(USER_PREFIX + id);
    await kv.del(USER_BY_EMAIL + (doc.email || "").toLowerCase());
    await kv.del(USER_BY_USERNAME + (doc.username || "").toLowerCase());
    const users = ((await kv.get<string[]>(USERS_KEY)) as string[]) || [];
    await kv.set(
      USERS_KEY,
      users.filter((u) => u !== id)
    );
    return;
  }

  if (isPrimary && extras.length > 0) {
    const [first, ...rest] = extras;
    if (isMongoConfigured()) {
      const db = await getDb();
      await db.collection<UserDoc>(COL_USERS).updateOne(
        { _id: id },
        {
          $set: {
            orgId: first.orgId,
            orgRole: first.orgRole,
            isAdmin: !!first.isAdmin,
            orgMemberships: rest,
          },
        }
      );
      return;
    }
    const kv = await getStore();
    const u = JSON.parse(JSON.stringify(doc)) as User;
    u.orgId = first.orgId;
    u.orgRole = first.orgRole as User["orgRole"];
    u.isAdmin = !!first.isAdmin;
    u.orgMemberships = rest;
    await kv.set(USER_PREFIX + id, JSON.stringify(u));
    return;
  }

  const rest = extras.filter((m) => m.orgId !== orgId);
  if (isMongoConfigured()) {
    const db = await getDb();
    await db.collection<UserDoc>(COL_USERS).updateOne({ _id: id }, { $set: { orgMemberships: rest } });
    return;
  }
  const kv = await getStore();
  const u = JSON.parse(JSON.stringify(doc)) as User;
  u.orgMemberships = rest;
  await kv.set(USER_PREFIX + id, JSON.stringify(u));
}
