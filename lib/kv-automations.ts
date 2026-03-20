import { getStore } from "./storage";
import { getDb, isMongoConfigured } from "./mongo";
import type { AutomationRule } from "./automation-types";
import type { Db } from "mongodb";

const COL = "board_automations";
const KV_PREFIX = "reborn_board_automations:";

type AutomationsDoc = {
  _id: string;
  orgId: string;
  rules: AutomationRule[];
  updatedAt: string;
};

let indexesEnsured = false;

async function ensureIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection(COL).createIndex({ orgId: 1, _id: 1 });
  indexesEnsured = true;
}

export async function getBoardAutomationRules(boardId: string, orgId: string): Promise<AutomationRule[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const doc = await db.collection<AutomationsDoc>(COL).findOne({ _id: boardId, orgId });
    return Array.isArray(doc?.rules) ? doc!.rules : [];
  }

  const kv = await getStore();
  const raw = await kv.get<string>(KV_PREFIX + boardId);
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed?.orgId !== orgId) return [];
    return Array.isArray(parsed?.rules) ? parsed.rules : [];
  } catch {
    return [];
  }
}

export async function setBoardAutomationRules(
  boardId: string,
  orgId: string,
  rules: AutomationRule[]
): Promise<void> {
  const updatedAt = new Date().toISOString();
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const doc: AutomationsDoc = { _id: boardId, orgId, rules, updatedAt };
    await db.collection<AutomationsDoc>(COL).replaceOne({ _id: boardId, orgId }, doc, { upsert: true });
    return;
  }

  const kv = await getStore();
  await kv.set(KV_PREFIX + boardId, JSON.stringify({ orgId, rules, updatedAt }));
}
