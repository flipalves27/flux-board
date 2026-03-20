import { getStore } from "@/lib/storage";
import { getDb, isMongoConfigured } from "@/lib/mongo";

const INTAKE_FORM_PREFIX = "reborn_intake_form:";
const COL_INTAKE_FORMS = "intake_forms";

export type IntakeFormIndexRecord = {
  slug: string;
  boardId: string;
  orgId: string;
  enabled: boolean;
  updatedAt: string;
};

export async function upsertIntakeFormIndex(record: IntakeFormIndexRecord): Promise<void> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await db.collection(COL_INTAKE_FORMS).createIndex({ slug: 1 }, { unique: true });
    await db.collection(COL_INTAKE_FORMS).replaceOne({ slug: record.slug }, record, { upsert: true });
    return;
  }

  const kv = await getStore();
  await kv.set(INTAKE_FORM_PREFIX + record.slug, JSON.stringify(record));
}

export async function getIntakeFormIndexBySlug(slug: string): Promise<IntakeFormIndexRecord | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await db.collection(COL_INTAKE_FORMS).createIndex({ slug: 1 }, { unique: true });
    const doc = await db.collection<IntakeFormIndexRecord>(COL_INTAKE_FORMS).findOne({ slug });
    return doc || null;
  }

  const kv = await getStore();
  const raw = await kv.get<string>(INTAKE_FORM_PREFIX + slug);
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as IntakeFormIndexRecord;
}
