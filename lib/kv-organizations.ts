import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { maxBoardsPerUser } from "./commercial-plan";
import type { OrgBranding } from "./org-branding";
import { addDaysIso, getFreeMaxBoards, getFreeMaxUsers, getPaidMaxBoards, getProMaxUsers, TRIAL_DAYS } from "./billing-limits";

export type BillingNotice =
  | { kind: "trial_ended"; at: string }
  | { kind: "downgrade_grace_ended"; at: string };

/** Preferências de IA (plano Business: modelo Claude e jobs em lote). */
export type OrgAiSettings = {
  /** Modelo Anthropic (ex.: claude-3-5-sonnet-20241022). */
  anthropicModel?: string;
  /** Digest/agregados sem usuário: preferir Claude vs Together quando a chave existir. */
  batchLlmProvider?: "anthropic" | "together";
  /** Usuários não-admin autorizados a usar a rota Claude (admin sempre pode). */
  claudeUserIds?: string[];
};

export interface Organization {
  _id: string; // "org_xxxxx"
  name: string;
  slug: string; // URL-friendly
  ownerId: string; // quem criou
  plan: "free" | "trial" | "pro" | "business" | "enterprise";
  maxUsers: number;
  maxBoards: number;
  /** Fim do trial (signup); aplicado com downgrade lazy para Free. */
  trialEndsAt?: string;
  /** Após cancelamento Stripe: acesso Pro com limites antigos até esta data (export). */
  downgradeGraceEndsAt?: string;
  downgradeFromTier?: "pro" | "business" | "enterprise";
  /** Avisos in-app (ex.: trial encerrado). */
  billingNotice?: BillingNotice | null;
  /** White-label (Enterprise): logo, cores, favicon; domínio customizado em plano Business. */
  branding?: OrgBranding;
  // Billing (Stripe)
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeStatus?: string;
  stripeCurrentPeriodEnd?: string; // ISO
  stripeSeats?: number;
  /** Feedback opcional ao cancelar/pausar (survey). */
  billingCancellationFeedback?: { reason: string; at: string };
  /** IA: modelo Claude, delegação e preferências de batch (Business). */
  aiSettings?: OrgAiSettings;
  createdAt: string;
}

const COL_ORGS = "organizations";
const DEFAULT_ORG_ID = "org_default";

const DEFAULT_MAX_BOARDS = (() => {
  const cap = maxBoardsPerUser();
  // Defaults alinhados ao modelo de precificação (imagem):
  // Free: 3 boards; Pro/Business: ilimitado (controlado via `plan`).
  if (typeof cap === "number") return cap;
  const fromEnv = Number(process.env.FLUX_FREE_MAX_BOARDS ?? "");
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return fromEnv;
  return 3;
})();

const DEFAULT_MAX_USERS = (() => {
  const fromEnvLegacy = Number(process.env.FLUX_MAX_USERS_PER_ORG ?? "");
  if (Number.isFinite(fromEnvLegacy) && fromEnvLegacy >= 1) return fromEnvLegacy;
  const fromEnvFree = Number(process.env.FLUX_FREE_MAX_USERS_PER_ORG ?? "");
  if (Number.isFinite(fromEnvFree) && fromEnvFree >= 1) return fromEnvFree;
  return 1;
})();

const DEFAULT_ORG_DOC: Omit<Organization, "_id"> = {
  name: "Default organization",
  slug: "default",
  ownerId: "admin",
  plan: "business",
  maxUsers: DEFAULT_MAX_USERS,
  maxBoards: DEFAULT_MAX_BOARDS,
  createdAt: new Date().toISOString(),
};

export { DEFAULT_ORG_ID };

let orgIndexesEnsured = false;

async function ensureOrgIndexes(db: Db): Promise<void> {
  if (orgIndexesEnsured) return;
  const col = db.collection<Organization>(COL_ORGS);
  await col.createIndex({ slug: 1 }, { unique: true });
  await col.createIndex({ ownerId: 1 });
  await col.createIndex({ "branding.customDomain": 1 }, { unique: true, sparse: true });
  orgIndexesEnsured = true;
}

export async function ensureDefaultOrganization(ownerId: string): Promise<Organization> {
  if (!isMongoConfigured()) {
    return {
      _id: DEFAULT_ORG_ID,
      ...DEFAULT_ORG_DOC,
      ownerId,
    };
  }

  const db = await getDb();
  await ensureOrgIndexes(db);

  const col = db.collection<Organization>(COL_ORGS);
  const doc = await col.findOne({ _id: DEFAULT_ORG_ID });
  if (doc) {
    // Mantém a org padrão do Admin com plano ilimitado e owner consistente.
    const patch: Partial<Organization> = {};
    if (doc.ownerId !== ownerId) patch.ownerId = ownerId;
    if (doc.plan !== "business") patch.plan = "business";
    if (Object.keys(patch).length > 0) {
      await col.updateOne({ _id: DEFAULT_ORG_ID }, { $set: patch });
      const updated = await col.findOne({ _id: DEFAULT_ORG_ID });
      if (updated) return updated;
    }
    return doc;
  }

  const toInsert: Organization = {
    _id: DEFAULT_ORG_ID,
    ...DEFAULT_ORG_DOC,
    ownerId,
  };
  await col.insertOne(toInsert);
  return toInsert;
}

/**
 * Migração para ambientes já existentes:
 * - popula `orgId` em `users`, `boards` e `user_boards` quando campo não existe
 * - garante que a `organizations` default exista
 *
 * Observação: no estado atual do app havia apenas 1 tenant lógico, então
 * migramos tudo para `org_default` como ponto de partida.
 */
export async function ensureTenancyMigrationForExistingData(ownerId: string): Promise<void> {
  if (!isMongoConfigured()) return;

  const db = await getDb();
  // Garante que a default exista antes de atualizar referências.
  await ensureDefaultOrganization(ownerId);

  const COL_USERS = "users";
  const COL_BOARDS = "boards";
  const COL_USER_BOARDS = "user_boards";

  // Atualiza docs antigos sem orgId.
  await db
    .collection(COL_USERS)
    .updateMany({ $or: [{ orgId: { $exists: false } }, { orgId: null }] }, { $set: { orgId: DEFAULT_ORG_ID } });

  await db
    .collection(COL_BOARDS)
    .updateMany({ $or: [{ orgId: { $exists: false } }, { orgId: null }] }, { $set: { orgId: DEFAULT_ORG_ID } });

  await db
    .collection(COL_USER_BOARDS)
    .updateMany(
      { $or: [{ orgId: { $exists: false } }, { orgId: null }] },
      { $set: { orgId: DEFAULT_ORG_ID } }
    );
}

function slugify(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function deriveOrgFromEmail(email: string): { name: string; slug: string } {
  const e = String(email || "").trim().toLowerCase();
  const domain = e.includes("@") ? e.split("@")[1] || "" : e;
  const base = domain.split(".")[0] || "tenant";
  const name = base.charAt(0).toUpperCase() + base.slice(1);
  const slug = slugify(base) || "tenant";
  return { name, slug };
}

function makeOrgId(): string {
  return `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Downgrades lazy: trial expirado → Free; grace de downgrade pago → limites Free. */
async function applyBillingTransitionIfNeeded(doc: Organization): Promise<Organization> {
  if (!isMongoConfigured()) return doc;
  const now = Date.now();
  let needsTrialExpiry = false;
  let needsGraceExpiry = false;

  if (doc.plan === "trial" && doc.trialEndsAt) {
    const end = new Date(doc.trialEndsAt).getTime();
    if (Number.isFinite(end) && end <= now) needsTrialExpiry = true;
  }
  if (doc.plan === "free" && doc.downgradeGraceEndsAt) {
    const g = new Date(doc.downgradeGraceEndsAt).getTime();
    if (Number.isFinite(g) && g <= now) needsGraceExpiry = true;
  }
  if (!needsTrialExpiry && !needsGraceExpiry) return doc;

  const db = await getDb();
  await ensureOrgIndexes(db);
  const col = db.collection<Organization>(COL_ORGS);

  if (needsTrialExpiry) {
    await col.updateOne(
      { _id: doc._id },
      {
        $set: {
          plan: "free",
          maxUsers: getFreeMaxUsers(),
          maxBoards: getFreeMaxBoards(),
          billingNotice: { kind: "trial_ended", at: new Date().toISOString() },
        },
        $unset: { trialEndsAt: "" },
      }
    );
  } else if (needsGraceExpiry) {
    await col.updateOne(
      { _id: doc._id },
      {
        $set: {
          maxUsers: getFreeMaxUsers(),
          maxBoards: getFreeMaxBoards(),
          billingNotice: { kind: "downgrade_grace_ended", at: new Date().toISOString() },
        },
        $unset: { downgradeGraceEndsAt: "", downgradeFromTier: "" },
      }
    );
  }

  const next = await col.findOne({ _id: doc._id });
  return next ?? doc;
}

export async function createOrganization(params: {
  ownerId: string;
  name?: string;
  slug?: string;
  plan?: Organization["plan"];
  maxUsers?: number;
  maxBoards?: number;
  trialEndsAt?: string;
}): Promise<Organization> {
  const plan = params.plan ?? "free";
  let maxUsers = typeof params.maxUsers === "number" ? params.maxUsers : DEFAULT_ORG_DOC.maxUsers;
  let maxBoards = typeof params.maxBoards === "number" ? params.maxBoards : DEFAULT_ORG_DOC.maxBoards;
  const trialEndsAt =
    plan === "trial"
      ? params.trialEndsAt ?? addDaysIso(TRIAL_DAYS)
      : undefined;
  if (plan === "trial") {
    maxUsers = getProMaxUsers();
    maxBoards = getPaidMaxBoards();
  }

  const resolved = (() => {
    if (params.name && params.slug) return { name: params.name, slug: params.slug };
    if (params.name && !params.slug) return { name: params.name, slug: slugify(params.name) };
    if (!params.name && params.slug) return { name: params.slug, slug: params.slug };
    return { name: "Organization", slug: "organization" };
  })();

  if (!isMongoConfigured()) {
    // KV-in-memory (dev): comportamento simplificado
    const org: Organization = {
      _id: makeOrgId(),
      ownerId: params.ownerId,
      name: params.name ?? resolved.name,
      slug: params.slug ?? resolved.slug,
      plan,
      maxUsers,
      maxBoards,
      ...(trialEndsAt ? { trialEndsAt } : {}),
      createdAt: new Date().toISOString(),
    };
    // Sem persistência em KV-memory quando Mongo não existe; retorna para fluxo.
    return org;
  }

  const db = await getDb();
  await ensureOrgIndexes(db);
  const col = db.collection<Organization>(COL_ORGS);

  let name = params.name ?? resolved.name;
  let slug = params.slug ?? resolved.slug;
  if (!name || !slug) {
    const derived = deriveOrgFromEmail(String(params.name || "").includes("@") ? String(params.name) : "tenant@local");
    name = name || derived.name;
    slug = slug || derived.slug;
  }
  slug = slugify(slug) || "tenant";

  // Se slug conflitar, incrementa sufixo até achar uma livre.
  let finalSlug = slug;
  for (let i = 0; i < 20; i++) {
    const exists = await col.findOne({ slug: finalSlug });
    if (!exists) break;
    finalSlug = `${slug}-${i + 1}`;
  }

  const org: Organization = {
    _id: makeOrgId(),
    ownerId: params.ownerId,
    name: name || "Organization",
    slug: finalSlug,
    plan,
    maxUsers,
    maxBoards,
    ...(trialEndsAt ? { trialEndsAt } : {}),
    createdAt: new Date().toISOString(),
  };

  await col.insertOne(org);
  return org;
}

/** Novo signup sem convite: trial 14 dias com limites equivalentes ao Pro. */
export async function createTrialOrganizationForSignup(ownerId: string, email: string): Promise<Organization> {
  const derived = deriveOrgFromEmail(email);
  return createOrganization({
    ownerId,
    name: derived.name,
    slug: derived.slug,
    plan: "trial",
  });
}

export async function createOrganizationFromEmail(ownerId: string, email: string): Promise<Organization> {
  const derived = deriveOrgFromEmail(email);
  return createOrganization({ ownerId, name: derived.name, slug: derived.slug, plan: "free" });
}

export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  if (!isMongoConfigured()) {
    if (orgId === DEFAULT_ORG_ID) {
      return {
        _id: DEFAULT_ORG_ID,
        ...DEFAULT_ORG_DOC,
      };
    }
    return null;
  }
  const db = await getDb();
  await ensureOrgIndexes(db);
  const col = db.collection<Organization>(COL_ORGS);
  const doc = await col.findOne({ _id: orgId });
  if (!doc) return null;
  return applyBillingTransitionIfNeeded(doc);
}

/** Resolve organização pelo host white-label (CNAME → Vercel). Host sem porta, lower-case. */
export async function getOrganizationByCustomDomain(host: string): Promise<Organization | null> {
  if (!isMongoConfigured()) return null;
  const h = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (!h) return null;
  const db = await getDb();
  await ensureOrgIndexes(db);
  const col = db.collection<Organization>(COL_ORGS);
  const doc = await col.findOne({ "branding.customDomain": h });
  return doc || null;
}

export async function findOtherOrgWithCustomDomain(domain: string, excludeOrgId: string): Promise<Organization | null> {
  if (!isMongoConfigured()) return null;
  const d = String(domain || "")
    .trim()
    .toLowerCase();
  if (!d) return null;
  const db = await getDb();
  await ensureOrgIndexes(db);
  const col = db.collection<Organization>(COL_ORGS);
  return (await col.findOne({ _id: { $ne: excludeOrgId }, "branding.customDomain": d })) || null;
}

export async function updateOrganization(
  orgId: string,
  updates: Partial<
    Pick<
      Organization,
      | "name"
      | "slug"
      | "plan"
      | "maxBoards"
      | "maxUsers"
      | "trialEndsAt"
      | "downgradeGraceEndsAt"
      | "downgradeFromTier"
      | "billingNotice"
      | "billingCancellationFeedback"
      | "stripeCustomerId"
      | "stripeSubscriptionId"
      | "stripePriceId"
      | "stripeStatus"
      | "stripeCurrentPeriodEnd"
      | "stripeSeats"
      | "branding"
      | "aiSettings"
    >
  >
): Promise<Organization | null> {
  if (!isMongoConfigured()) return null;
  const db = await getDb();
  await ensureOrgIndexes(db);
  const col = db.collection<Organization>(COL_ORGS);

  if (updates.slug) {
    const slug = String(updates.slug).trim().toLowerCase();
    if (!slug) throw new Error("slug inválido");
    // Evita colisão de slug.
    const existing = await col.findOne({ _id: { $ne: orgId }, slug });
    if (existing) throw new Error("Slug já está em uso por outra organização.");
    updates.slug = slugify(slug);
  }

  const op: Record<string, unknown> = { $set: updates };
  await col.updateOne({ _id: orgId }, op);
  const doc = await col.findOne({ _id: orgId });
  if (!doc) return null;
  return applyBillingTransitionIfNeeded(doc);
}

/** Atualiza campos e opcionalmente remove chaves (ex.: limpar grace após reativar Stripe). */
export async function updateOrganizationWithUnset(
  orgId: string,
  updates: Partial<
    Pick<
      Organization,
      | "name"
      | "slug"
      | "plan"
      | "maxBoards"
      | "maxUsers"
      | "trialEndsAt"
      | "downgradeGraceEndsAt"
      | "downgradeFromTier"
      | "billingNotice"
      | "billingCancellationFeedback"
      | "stripeCustomerId"
      | "stripeSubscriptionId"
      | "stripePriceId"
      | "stripeStatus"
      | "stripeCurrentPeriodEnd"
      | "stripeSeats"
      | "branding"
      | "aiSettings"
    >
  >,
  unsetKeys: (keyof Organization)[]
): Promise<Organization | null> {
  if (!isMongoConfigured()) return null;
  const db = await getDb();
  await ensureOrgIndexes(db);
  const col = db.collection<Organization>(COL_ORGS);
  const $unset = Object.fromEntries(unsetKeys.map((k) => [k, ""])) as Record<string, "">;
  await col.updateOne({ _id: orgId }, { $set: updates, $unset } as Parameters<typeof col.updateOne>[1]);
  const doc = await col.findOne({ _id: orgId });
  if (!doc) return null;
  return applyBillingTransitionIfNeeded(doc);
}

export async function updateOrganizationOwner(orgId: string, ownerId: string): Promise<void> {
  if (!isMongoConfigured()) return;
  const db = await getDb();
  await ensureOrgIndexes(db);
  const col = db.collection<Organization>(COL_ORGS);
  await col.updateOne({ _id: orgId }, { $set: { ownerId } });
}

