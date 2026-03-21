import { randomBytes } from "crypto";
import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { addDaysIso } from "./billing-limits";

const COL = "board_embeds";

export type EmbedWidgetKind = "badge" | "kanban" | "heatmap" | "okr";

export type BoardEmbedRecord = {
  _id: string;
  token: string;
  boardId: string;
  orgId: string;
  kind: EmbedWidgetKind;
  createdAt: string;
  /** ISO — após esta data o token deixa de servir dados (padrão 90 dias na criação). */
  expiresAt?: string;
};

const memoryEmbeds = new Map<string, BoardEmbedRecord>();

let indexesEnsured = false;

async function ensureIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection(COL).createIndex({ token: 1 }, { unique: true });
  await db.collection(COL).createIndex({ boardId: 1, orgId: 1 });
  indexesEnsured = true;
}

function makeToken(): string {
  return randomBytes(24).toString("base64url");
}

function embedTtlDays(): number {
  const raw = process.env.FLUX_EMBED_TOKEN_TTL_DAYS;
  const n = raw ? Number.parseInt(raw, 10) : 90;
  return Number.isFinite(n) && n >= 1 ? n : 90;
}

export async function createBoardEmbed(params: {
  boardId: string;
  orgId: string;
  kind: EmbedWidgetKind;
}): Promise<BoardEmbedRecord> {
  const now = new Date().toISOString();
  const token = makeToken();
  const doc: BoardEmbedRecord = {
    _id: `emb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    token,
    boardId: params.boardId,
    orgId: params.orgId,
    kind: params.kind,
    createdAt: now,
    expiresAt: addDaysIso(embedTtlDays(), new Date()),
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection<BoardEmbedRecord>(COL).insertOne(doc);
    return doc;
  }
  memoryEmbeds.set(token, doc);
  return doc;
}

export async function getEmbedByToken(token: string): Promise<BoardEmbedRecord | null> {
  if (!token) return null;
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const doc = await db.collection<BoardEmbedRecord>(COL).findOne({ token });
    return doc || null;
  }
  return memoryEmbeds.get(token) ?? null;
}
