import type { Db } from "mongodb";
import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";

const DOC_PREFIX = "reborn_doc:";
const DOCS_BY_ORG_PREFIX = "reborn_docs_by_org:";
const DOC_COUNTER = "reborn_doc_counter";

const COL_DOCS = "docs";
const COL_COUNTERS = "counters";

export interface DocData {
  id: string;
  orgId: string;
  title: string;
  slug: string;
  parentId: string | null;
  contentMd: string;
  excerpt: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

type DocDoc = Omit<DocData, "id"> & { _id: string };

let docsIndexesEnsured = false;
let docsCounterLocal = 0;

function orgDocsKey(orgId: string) {
  return `${DOCS_BY_ORG_PREFIX}${orgId}`;
}

function toDoc(data: DocData): DocDoc {
  const { id, ...rest } = data;
  return { _id: id, ...rest };
}

function fromDoc(doc: DocDoc): DocData {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id };
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function normalize(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function slugifyDocTitle(input: string): string {
  const raw = normalize(input);
  const slug = raw
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "untitled-doc";
}

function excerptFromMarkdown(contentMd: string): string {
  const plain = String(contentMd || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]*\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 220);
}

async function nextDocId(db?: Db): Promise<string> {
  if (isMongoConfigured() && db) {
    const row = await db.collection<{ _id: string; seq: number }>(COL_COUNTERS).findOneAndUpdate(
      { _id: "doc" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );
    const seq = typeof row?.seq === "number" ? row.seq : Date.now();
    return `d_${seq}`;
  }
  docsCounterLocal += 1;
  const kv = await getStore();
  const persisted = ((await kv.get<number>(DOC_COUNTER)) as number | null) ?? 0;
  const next = Math.max(docsCounterLocal, persisted + 1);
  docsCounterLocal = next;
  await kv.set(DOC_COUNTER, next);
  return `d_${next}`;
}

async function ensureDocsIndexes(db: Db): Promise<void> {
  if (docsIndexesEnsured) return;
  await db.collection<DocDoc>(COL_DOCS).createIndex({ orgId: 1, parentId: 1, updatedAt: -1 });
  await db.collection<DocDoc>(COL_DOCS).createIndex({ orgId: 1, slug: 1 }, { unique: false });
  await db.collection<DocDoc>(COL_DOCS).createIndex({ orgId: 1, archivedAt: 1 });
  await db.collection<DocDoc>(COL_DOCS).createIndex({ title: "text", contentMd: "text", excerpt: "text", tags: "text" });
  docsIndexesEnsured = true;
}

export async function getDocById(orgId: string, id: string): Promise<DocData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureDocsIndexes(db);
    const doc = await db.collection<DocDoc>(COL_DOCS).findOne({ _id: id, orgId, archivedAt: { $in: [null, undefined] } as any });
    return doc ? fromDoc(doc) : null;
  }
  const kv = await getStore();
  const raw = await kv.get<string>(`${DOC_PREFIX}${id}`);
  if (!raw) return null;
  const doc = (typeof raw === "string" ? JSON.parse(raw) : raw) as DocData;
  if (doc.orgId !== orgId || doc.archivedAt) return null;
  return doc;
}

export async function listDocsFlat(orgId: string): Promise<DocData[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureDocsIndexes(db);
    const rows = await db.collection<DocDoc>(COL_DOCS).find({ orgId, archivedAt: { $in: [null, undefined] } as any }).toArray();
    return rows.map(fromDoc).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) * -1);
  }

  const kv = await getStore();
  const ids = (((await kv.get<string[]>(orgDocsKey(orgId))) as string[] | null) ?? []).filter(Boolean);
  const docs = await Promise.all(ids.map((id) => getDocById(orgId, id)));
  return docs.filter((d): d is DocData => Boolean(d)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) * -1);
}

export async function listDocsTree(orgId: string): Promise<Array<DocData & { children: DocData[] }>> {
  const docs = await listDocsFlat(orgId);
  const byParent = new Map<string | null, DocData[]>();
  for (const d of docs) {
    const key = d.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(d);
    byParent.set(key, list);
  }
  const roots = byParent.get(null) ?? [];
  return roots.map((r) => ({
    ...r,
    children: byParent.get(r.id) ?? [],
  }));
}

export async function createDoc(input: {
  orgId: string;
  title: string;
  parentId?: string | null;
  contentMd?: string;
  tags?: string[];
}): Promise<DocData> {
  const now = new Date().toISOString();
  const title = String(input.title || "").trim() || "Untitled";
  const contentMd = String(input.contentMd || "");
  const parentId = input.parentId ?? null;
  const docId = await nextDocId(isMongoConfigured() ? await getDb() : undefined);
  const doc: DocData = {
    id: docId,
    orgId: input.orgId,
    title,
    slug: slugifyDocTitle(title),
    parentId,
    contentMd,
    excerpt: excerptFromMarkdown(contentMd),
    tags: unique((input.tags || []).map((t) => String(t || "").trim()).filter(Boolean)),
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureDocsIndexes(db);
    await db.collection<DocDoc>(COL_DOCS).insertOne(toDoc(doc));
    return doc;
  }

  const kv = await getStore();
  await kv.set(`${DOC_PREFIX}${doc.id}`, JSON.stringify(doc));
  const ids = (((await kv.get<string[]>(orgDocsKey(input.orgId))) as string[] | null) ?? []).filter(Boolean);
  if (!ids.includes(doc.id)) ids.push(doc.id);
  await kv.set(orgDocsKey(input.orgId), ids);
  return doc;
}

export async function updateDoc(orgId: string, id: string, updates: Partial<DocData>): Promise<DocData | null> {
  const current = await getDocById(orgId, id);
  if (!current) return null;
  const contentMd = updates.contentMd !== undefined ? String(updates.contentMd || "") : current.contentMd;
  const title = updates.title !== undefined ? String(updates.title || "").trim() || "Untitled" : current.title;
  const next: DocData = {
    ...current,
    ...updates,
    title,
    contentMd,
    slug: updates.title !== undefined ? slugifyDocTitle(title) : current.slug,
    excerpt: updates.contentMd !== undefined ? excerptFromMarkdown(contentMd) : current.excerpt,
    tags:
      updates.tags !== undefined
        ? unique((updates.tags || []).map((t) => String(t || "").trim()).filter(Boolean))
        : current.tags,
    updatedAt: new Date().toISOString(),
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureDocsIndexes(db);
    await db.collection<DocDoc>(COL_DOCS).replaceOne({ _id: id, orgId }, toDoc(next));
    return next;
  }
  const kv = await getStore();
  await kv.set(`${DOC_PREFIX}${id}`, JSON.stringify(next));
  return next;
}

export async function moveDoc(orgId: string, id: string, parentId: string | null): Promise<DocData | null> {
  return updateDoc(orgId, id, { parentId });
}

export async function deleteDoc(orgId: string, id: string): Promise<boolean> {
  const current = await getDocById(orgId, id);
  if (!current) return false;
  const childDocs = await listDocsFlat(orgId);
  const childIds = childDocs.filter((d) => d.parentId === id).map((d) => d.id);

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureDocsIndexes(db);
    await db.collection<DocDoc>(COL_DOCS).updateOne({ _id: id, orgId }, { $set: { archivedAt: new Date().toISOString() } });
    if (childIds.length) {
      await db.collection<DocDoc>(COL_DOCS).updateMany({ _id: { $in: childIds }, orgId }, { $set: { parentId: null } });
    }
    return true;
  }
  const kv = await getStore();
  await kv.set(`${DOC_PREFIX}${id}`, JSON.stringify({ ...current, archivedAt: new Date().toISOString() }));
  for (const childId of childIds) {
    const child = await getDocById(orgId, childId);
    if (!child) continue;
    await kv.set(`${DOC_PREFIX}${childId}`, JSON.stringify({ ...child, parentId: null, updatedAt: new Date().toISOString() }));
  }
  return true;
}

export async function searchDocs(orgId: string, query: string, limit = 20): Promise<DocData[]> {
  const q = String(query || "").trim();
  if (!q) return [];

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureDocsIndexes(db);
    const rows = await db
      .collection<DocDoc>(COL_DOCS)
      .find(
        { orgId, archivedAt: { $in: [null, undefined] } as any, $text: { $search: q } },
        { projection: { score: { $meta: "textScore" } } as any }
      )
      .sort({ score: { $meta: "textScore" } as any })
      .limit(Math.max(1, Math.min(limit, 100)))
      .toArray();
    return rows.map(fromDoc);
  }

  const docs = await listDocsFlat(orgId);
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  const scored = docs
    .map((doc) => {
      const hay = normalize(`${doc.title}\n${doc.contentMd}\n${doc.excerpt}\n${doc.tags.join(" ")}`);
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += 1;
      if (normalize(doc.title).includes(normalize(q))) score += 3;
      return { doc, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 100)));
  return scored.map((x) => x.doc);
}
