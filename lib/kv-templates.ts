import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import type {
  PublishedTemplate,
  TemplateCategory,
  TemplateLifecycleStatus,
  TemplatePricingTier,
} from "./template-types";
import { TEMPLATE_CATEGORIES } from "./template-types";

const COL = "published_templates";

/** Fallback em memória quando Mongo não está configurado (dev). */
const memoryStore = new Map<string, PublishedTemplate>();

async function seedMemoryTemplatesIfNeeded(): Promise<void> {
  if (isMongoConfigured() || memoryStore.size > 0) return;
  const { ONBOARDING_TEMPLATES } = await import("./onboarding");
  const seeds: Array<{ key: keyof typeof ONBOARDING_TEMPLATES; category: TemplateCategory }> = [
    { key: "vendas", category: "sales" },
    { key: "projetos", category: "projects" },
    { key: "operacoes", category: "operations" },
  ];
  const now = new Date().toISOString();
  for (const s of seeds) {
    const def = ONBOARDING_TEMPLATES[s.key];
    const bucketOrder = def.buckets.map((b) => ({ key: b.key, label: b.label, color: b.color }));
    const doc: PublishedTemplate = {
      _id: `tpl_seed_${s.key}`,
      slug: `showcase-${s.key}`,
      title: def.title,
      description: `Template de referência (${def.title}) — colunas e rótulos sem cards.`,
      category: s.category,
      pricingTier: "free",
      creatorRevenueSharePercent: 100,
      creatorOrgId: "org_flux_showcase",
      creatorOrgName: "Flux-Board",
      snapshot: {
        config: { bucketOrder, collapsedColumns: [] },
        mapaProducao: [],
        labelPalette: [],
        automations: [],
      },
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.set(doc._id, doc);
  }
}

let indexesEnsured = false;

async function ensureIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection(COL).createIndex({ slug: 1 }, { unique: true });
  await db.collection(COL).createIndex({ category: 1 });
  await db.collection(COL).createIndex({ status: 1 });
  await db.collection(COL).createIndex({ createdAt: -1 });
  indexesEnsured = true;
}

function slugify(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function makeId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listPublishedTemplates(params?: {
  category?: TemplateCategory;
  limit?: number;
  status?: TemplateLifecycleStatus;
}): Promise<PublishedTemplate[]> {
  const limit = Math.min(Math.max(params?.limit ?? 60, 1), 200);
  const cat = params?.category;
  const status = params?.status;

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const q: Record<string, unknown> = {};
    if (cat && TEMPLATE_CATEGORIES.includes(cat)) q.category = cat;
    if (status) {
      q.status = status;
    } else {
      q.status = { $ne: "archived" };
    }
    const docs = await db
      .collection<PublishedTemplate>(COL)
      .find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs;
  }

  await seedMemoryTemplatesIfNeeded();
  const all = [...memoryStore.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const filtered = all.filter((t) => {
    if (cat && t.category !== cat) return false;
    const effectiveStatus = t.status ?? "published";
    if (status) return effectiveStatus === status;
    return effectiveStatus !== "archived";
  });
  return filtered.slice(0, limit);
}

export async function getPublishedTemplateById(id: string): Promise<PublishedTemplate | null> {
  if (!id) return null;
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const doc = await db.collection<PublishedTemplate>(COL).findOne({ _id: id });
    return doc || null;
  }
  await seedMemoryTemplatesIfNeeded();
  return memoryStore.get(id) ?? null;
}

export async function getPublishedTemplateBySlug(slug: string): Promise<PublishedTemplate | null> {
  if (!slug) return null;
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const doc = await db.collection<PublishedTemplate>(COL).findOne({ slug });
    return doc || null;
  }
  await seedMemoryTemplatesIfNeeded();
  return [...memoryStore.values()].find((t) => t.slug === slug) ?? null;
}

export async function deletePublishedTemplate(id: string): Promise<boolean> {
  if (!id) return false;
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const res = await db.collection<PublishedTemplate>(COL).deleteOne({ _id: id });
    return res.deletedCount > 0;
  }
  return memoryStore.delete(id);
}

export async function insertPublishedTemplate(doc: PublishedTemplate): Promise<PublishedTemplate> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection<PublishedTemplate>(COL).insertOne(doc);
    return doc;
  }
  memoryStore.set(doc._id, doc);
  return doc;
}

export async function updatePublishedTemplate(
  id: string,
  patch: Partial<
    Pick<
      PublishedTemplate,
      | "title"
      | "description"
      | "category"
      | "pricingTier"
      | "snapshot"
      | "status"
      | "version"
      | "publishedAt"
      | "archivedAt"
      | "updatedBy"
      | "updatedAt"
    >
  >
): Promise<PublishedTemplate | null> {
  if (!id) return null;
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection<PublishedTemplate>(COL).updateOne({ _id: id }, { $set: patch });
    return getPublishedTemplateById(id);
  }
  const cur = memoryStore.get(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  memoryStore.set(id, next);
  return next;
}

export async function ensureUniqueSlug(base: string): Promise<string> {
  let s = slugify(base) || "template";
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const col = db.collection<PublishedTemplate>(COL);
    for (let i = 0; i < 30; i++) {
      const trySlug = i === 0 ? s : `${s}-${i + 1}`;
      const exists = await col.findOne({ slug: trySlug });
      if (!exists) return trySlug;
    }
    return `${s}-${Date.now()}`;
  }
  for (let i = 0; i < 30; i++) {
    const trySlug = i === 0 ? s : `${s}-${i + 1}`;
    const clash = [...memoryStore.values()].some((t) => t.slug === trySlug);
    if (!clash) return trySlug;
  }
  return `${s}-${Date.now()}`;
}

export type CreateTemplateInput = {
  title: string;
  description: string;
  category: TemplateCategory;
  pricingTier: TemplatePricingTier;
  creatorOrgId: string;
  creatorOrgName?: string;
  snapshot: PublishedTemplate["snapshot"];
  sourceBoardId?: string;
  status?: TemplateLifecycleStatus;
  updatedBy?: string;
};

export async function createPublishedTemplate(input: CreateTemplateInput): Promise<PublishedTemplate> {
  const now = new Date().toISOString();
  const slug = await ensureUniqueSlug(input.title);
  const doc: PublishedTemplate = {
    _id: makeId(),
    slug,
    title: input.title.trim().slice(0, 200),
    description: input.description.trim().slice(0, 2000),
    category: input.category,
    pricingTier: input.pricingTier,
    creatorRevenueSharePercent: input.pricingTier === "premium" ? 70 : 100,
    creatorOrgId: input.creatorOrgId,
    creatorOrgName: input.creatorOrgName,
    snapshot: input.snapshot,
    sourceBoardId: input.sourceBoardId,
    status: input.status ?? "published",
    version: 1,
    publishedAt: input.status === "draft" ? undefined : now,
    updatedBy: input.updatedBy,
    createdAt: now,
    updatedAt: now,
  };
  return insertPublishedTemplate(doc);
}

export async function publishTemplate(id: string, updatedBy?: string): Promise<PublishedTemplate | null> {
  const now = new Date().toISOString();
  const existing = await getPublishedTemplateById(id);
  if (!existing) return null;
  return updatePublishedTemplate(id, {
    status: "published",
    publishedAt: now,
    archivedAt: undefined,
    version: Math.max(1, Number(existing.version ?? 1)) + 1,
    updatedBy,
    updatedAt: now,
  });
}
