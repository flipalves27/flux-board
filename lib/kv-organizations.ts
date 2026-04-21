import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { DEFAULT_ORG_ID } from "./org-constants";
import { maxBoardsPerUser } from "./commercial-plan";
import type { OrgBranding } from "./org-branding";
import type { UxV2Features } from "@/types/ux-v2-features";
import { addDaysIso, getFreeMaxBoards, getFreeMaxUsers, getPaidMaxBoards, getProMaxUsers, TRIAL_DAYS } from "./billing-limits";

export type BillingNotice =
  | { kind: "trial_ended"; at: string }
  | { kind: "downgrade_grace_ended"; at: string };

/** Preferências de IA (plano Business: modelo Claude e jobs em lote). */
/** Preferências de UI / rollout (Onda 4). */
export type OrgUiOnda4Settings = {
  enabled?: boolean;
  omnibar?: boolean;
  dailyBriefing?: boolean;
  anomalyToasts?: boolean;
};

export type OrgUiSettings = {
  onda4?: OrgUiOnda4Settings;
  /** UX v2 rollout — partial overrides; see `resolveUxV2Flags`. */
  uxV2?: Partial<UxV2Features>;
};

export type OrgAiSettings = {
  /** Modelo Anthropic (ex.: claude-3-5-sonnet-20241022). */
  anthropicModel?: string;
  /** Digest/agregados sem usuário: preferir Claude vs Together quando a chave existir. */
  batchLlmProvider?: "anthropic" | "together";
  /** Usuários não-admin autorizados a usar a rota Claude (admin sempre pode). */
  claudeUserIds?: string[];
};

export type OrganizationPlan = "free" | "trial" | "pro" | "business";

export interface Organization {
  _id: string; // "org_xxxxx"
  name: string;
  slug: string; // URL-friendly
  ownerId: string; // quem criou
  plan: OrganizationPlan;
  maxUsers: number;
  maxBoards: number;
  /** Fim do trial (signup); aplicado com downgrade lazy para Free. */
  trialEndsAt?: string;
  /** Após cancelamento Stripe: acesso Pro com limites antigos até esta data (export). */
  downgradeGraceEndsAt?: string;
  downgradeFromTier?: "pro" | "business";
  /** Avisos in-app (ex.: trial encerrado). */
  billingNotice?: BillingNotice | null;
  /** White-label: logo, cores, favicon; domínio customizado em plano Business. */
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
  /** UI / feature rollout (ex.: Onda 4). */
  ui?: OrgUiSettings;
  createdAt: string;
}

const COL_ORGS = "organizations";
/** Marca migrações idempotentes já aplicadas (evita `updateMany` em coleções inteiras a cada pedido, ex. serverless). */
const COL_APP_MIGRATIONS = "app_migrations";
/** Documento `_id` em `app_migrations` quando o backfill de `orgId` terminou (ver script `mongo:ensure-tenancy-migration`). */
export const TENANCY_ORGID_BACKFILL_MIGRATION_ID = "tenancy_orgid_backfill_v1" as const;

/**
 * Documentos Mongo antigos podem ter `plan: "enterprise"` — tratamos como Business em memória.
 */
export function hydrateOrganization(doc: Organization): Organization {
  const rawPlan = String(doc.plan ?? "");
  const plan: OrganizationPlan =
    rawPlan === "enterprise"
      ? "business"
      : rawPlan === "free" || rawPlan === "trial" || rawPlan === "pro" || rawPlan === "business"
        ? rawPlan
        : "free";
  const rawDf = doc.downgradeFromTier as string | undefined;
  let downgradeFromTier = doc.downgradeFromTier;
  if (rawDf === "enterprise") downgradeFromTier = "business";
  if (plan === doc.plan && downgradeFromTier === doc.downgradeFromTier) return doc;
  const next: Organization = { ...doc, plan };
  if (downgradeFromTier !== undefined) next.downgradeFromTier = downgradeFromTier;
  else delete next.downgradeFromTier;
  return next;
}

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
      if (updated) return hydrateOrganization(updated as Organization);
    }
    return hydrateOrganization(doc as Organization);
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
  const migrations = db.collection<{ _id: string; completedAt?: string }>(COL_APP_MIGRATIONS);
  const already = await migrations.findOne({ _id: TENANCY_ORGID_BACKFILL_MIGRATION_ID });
  if (already) return;

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

  await migrations.updateOne(
    { _id: TENANCY_ORGID_BACKFILL_MIGRATION_ID },
    { $set: { completedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

/** Verificação barata (só `findOne`) — útil em jobs de deploy e diagnóstico. */
export async function isTenancyOrgIdBackfillApplied(): Promise<boolean> {
  if (!isMongoConfigured()) return true;
  const db = await getDb();
  const doc = await db
    .collection<{ _id: string }>(COL_APP_MIGRATIONS)
    .findOne({ _id: TENANCY_ORGID_BACKFILL_MIGRATION_ID });
  return Boolean(doc);
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
  doc = hydrateOrganization(doc);
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
  return hydrateOrganization((next ?? doc) as Organization);
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

/** Novo signup sem convite: trial 20 dias com limites equivalentes ao Pro. */
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
  return applyBillingTransitionIfNeeded(doc as Organization);
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
  return doc ? hydrateOrganization(doc as Organization) : null;
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
  const o = await col.findOne({ _id: { $ne: excludeOrgId }, "branding.customDomain": d });
  return o ? hydrateOrganization(o as Organization) : null;
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
      | "ui"
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
      | "ui"
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

const COL_USERS_REF = "users";

function escapeOrgRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type OrganizationListRow = Organization & { memberCount: number };

/**
 * Lista organizações com contagem de membros. Requer MongoDB para dados completos.
 * Sem Mongo: devolve apenas a organização default com contagem via KV.
 */
export async function listAllOrganizationsPaginated(params: {
  limit: number;
  cursor?: string | null;
  q?: string;
}): Promise<{ organizations: OrganizationListRow[]; nextCursor: string | null; storage: "mongo" | "kv" }> {
  const limit = Math.min(Math.max(1, params.limit || 50), 200);
  const q = (params.q || "").trim();

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOrgIndexes(db);
    const col = db.collection<Organization>(COL_ORGS);
    const parts: Record<string, unknown>[] = [];
    if (params.cursor) parts.push({ _id: { $gt: params.cursor } });
    if (q) {
      const rx = new RegExp(escapeOrgRegex(q), "i");
      parts.push({ $or: [{ name: rx }, { slug: rx }, { _id: rx }] });
    }
    const match = parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { $and: parts };

    const rows = await col
      .aggregate([
        { $match: match },
        { $sort: { _id: 1 } },
        { $limit: limit + 1 },
        {
          $lookup: {
            from: COL_USERS_REF,
            localField: "_id",
            foreignField: "orgId",
            as: "_m",
          },
        },
        { $addFields: { memberCount: { $size: "$_m" } } },
        { $project: { _m: 0 } },
      ])
      .toArray();

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && slice.length ? (slice[slice.length - 1] as Organization)._id : null;
    return {
      organizations: slice.map((doc) => {
        const raw = doc as Organization & { memberCount: number };
        return {
          ...hydrateOrganization(raw),
          memberCount: raw.memberCount ?? 0,
        };
      }),
      nextCursor,
      storage: "mongo",
    };
  }

  const { listUsers } = await import("./kv-users");
  const members = await listUsers(DEFAULT_ORG_ID);
  const base = { _id: DEFAULT_ORG_ID, ...DEFAULT_ORG_DOC } as Organization;
  const h = hydrateOrganization(base);
  if (q) {
    const n = q.toLowerCase();
    const hay = `${h.name} ${h.slug} ${h._id}`.toLowerCase();
    if (!hay.includes(n)) {
      return { organizations: [], nextCursor: null, storage: "kv" };
    }
  }
  return {
    organizations: [{ ...h, memberCount: members.length }],
    nextCursor: null,
    storage: "kv",
  };
}

