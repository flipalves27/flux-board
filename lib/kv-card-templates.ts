import { getStore } from "./storage";
import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";

const KV_PREFIX = "flux_card_templates:";
const COL_CARD_TEMPLATES = "card_templates";

export interface CardTemplate {
  id: string;
  orgId: string;
  name: string;
  title: string;
  description: string;
  tags: string[];
  priority: string;
  subtasks?: string[];
  createdBy: string;
  createdAt: string;
}

type CardTemplateDoc = Omit<CardTemplate, "id"> & { _id: string };

function docToData(doc: CardTemplateDoc): CardTemplate {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id };
}

function dataToDoc(t: CardTemplate): CardTemplateDoc {
  const { id, ...rest } = t;
  return { _id: id, ...rest };
}

function orgKey(orgId: string) {
  return KV_PREFIX + orgId;
}

let indexesEnsured = false;
async function ensureIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection<CardTemplateDoc>(COL_CARD_TEMPLATES).createIndex({ orgId: 1 });
  indexesEnsured = true;
}

export async function listCardTemplates(orgId: string): Promise<CardTemplate[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const docs = await db
      .collection<CardTemplateDoc>(COL_CARD_TEMPLATES)
      .find({ orgId })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(docToData);
  }

  const kv = await getStore();
  const all = (await kv.get<CardTemplate[]>(orgKey(orgId))) as CardTemplate[] | null;
  return all ?? [];
}

export async function getCardTemplate(orgId: string, templateId: string): Promise<CardTemplate | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const doc = await db
      .collection<CardTemplateDoc>(COL_CARD_TEMPLATES)
      .findOne({ _id: templateId, orgId });
    return doc ? docToData(doc) : null;
  }

  const all = await listCardTemplates(orgId);
  return all.find((t) => t.id === templateId) ?? null;
}

export async function saveCardTemplate(template: CardTemplate): Promise<void> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db
      .collection<CardTemplateDoc>(COL_CARD_TEMPLATES)
      .replaceOne({ _id: template.id, orgId: template.orgId }, dataToDoc(template), { upsert: true });
    return;
  }

  const kv = await getStore();
  const all = await listCardTemplates(template.orgId);
  const idx = all.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    all[idx] = template;
  } else {
    all.unshift(template);
  }
  await kv.set(orgKey(template.orgId), all);
}

export async function deleteCardTemplate(orgId: string, templateId: string): Promise<void> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection<CardTemplateDoc>(COL_CARD_TEMPLATES).deleteOne({ _id: templateId, orgId });
    return;
  }

  const kv = await getStore();
  const all = await listCardTemplates(orgId);
  const filtered = all.filter((t) => t.id !== templateId);
  await kv.set(orgKey(orgId), filtered);
}
