import type { Db } from "mongodb";
import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";
import { sanitizeText, type FluxyMessageData } from "./schemas";

const COL_MESSAGES = "fluxy_messages";

function mkId(): string {
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function messageKey(orgId: string, boardId: string, messageId: string): string {
  return `fluxy_message:${orgId}:${boardId}:${messageId}`;
}

function indexKey(orgId: string, boardId: string, scope: "board" | "card" | "direct", cardId: string | null): string {
  return `fluxy_messages_index:${orgId}:${boardId}:${scope}:${cardId ?? "none"}`;
}

export function normalizeFluxyMessageBody(body: string): string {
  return sanitizeText(body).trim().slice(0, 4000);
}

type CursorPayload = { createdAt: string; id: string };

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(raw?: string | null): CursorPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as CursorPayload;
    if (typeof parsed?.createdAt !== "string" || typeof parsed?.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function compareMessageDesc(a: FluxyMessageData, b: FluxyMessageData): number {
  const d = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (d !== 0) return d;
  return b.id.localeCompare(a.id);
}

let indexEnsured = false;
async function ensureIndexes(db: Db): Promise<void> {
  if (indexEnsured) return;
  await db.collection(COL_MESSAGES).createIndex({ orgId: 1, boardId: 1, conversationScope: 1, relatedCardId: 1, createdAt: -1 });
  await db.collection(COL_MESSAGES).createIndex({ orgId: 1, boardId: 1, id: 1 }, { unique: true });
  indexEnsured = true;
}

export async function createFluxyMessage(input: {
  orgId: string;
  boardId: string;
  body: string;
  conversationScope: "board" | "card" | "direct";
  relatedCardId?: string | null;
  contextCardId?: string | null;
  participants?: FluxyMessageData["participants"];
  mentions?: FluxyMessageData["mentions"];
  targetUserIds?: string[];
  createdBy: FluxyMessageData["createdBy"];
  mediatedByFluxy?: boolean;
}): Promise<FluxyMessageData> {
  const now = new Date().toISOString();
  const message: FluxyMessageData = {
    id: mkId(),
    orgId: input.orgId,
    boardId: input.boardId,
    conversationScope: input.conversationScope,
    relatedCardId: input.relatedCardId ?? null,
    contextCardId: input.contextCardId ?? null,
    body: normalizeFluxyMessageBody(input.body),
    participants: input.participants ?? [],
    mentions: input.mentions ?? [],
    targetUserIds: input.targetUserIds ?? [],
    createdBy: input.createdBy,
    mediatedByFluxy: input.mediatedByFluxy ?? false,
    createdAt: now,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection<FluxyMessageData>(COL_MESSAGES).insertOne(message as never);
    return message;
  }

  const store = await getStore();
  await store.set(messageKey(input.orgId, input.boardId, message.id), message);
  const idxKey = indexKey(input.orgId, input.boardId, input.conversationScope, message.relatedCardId);
  const ids = ((await store.get<string[]>(idxKey)) as string[]) ?? [];
  ids.push(message.id);
  await store.set(idxKey, ids);
  return message;
}

export async function listFluxyMessages(input: {
  orgId: string;
  boardId: string;
  conversationScope: "board" | "card" | "direct";
  relatedCardId?: string | null;
  limit?: number;
  cursor?: string | null;
}): Promise<{ items: FluxyMessageData[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(100, input.limit ?? 20));
  const decodedCursor = decodeCursor(input.cursor);

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const docs = await db.collection<FluxyMessageData>(COL_MESSAGES)
      .find({
        orgId: input.orgId,
        boardId: input.boardId,
        conversationScope: input.conversationScope,
        relatedCardId: input.relatedCardId ?? null,
      } as never)
      .toArray();
    docs.sort(compareMessageDesc);
    const filtered = decodedCursor
      ? docs.filter((m) =>
          new Date(m.createdAt).getTime() < new Date(decodedCursor.createdAt).getTime() ||
          (m.createdAt === decodedCursor.createdAt && m.id < decodedCursor.id)
        )
      : docs;
    const items = filtered.slice(0, limit);
    const tail = items.at(-1);
    return { items, nextCursor: tail ? encodeCursor({ createdAt: tail.createdAt, id: tail.id }) : null };
  }

  const store = await getStore();
  const ids = ((await store.get<string[]>(
    indexKey(input.orgId, input.boardId, input.conversationScope, input.relatedCardId ?? null)
  )) as string[]) ?? [];
  const ordered = [...ids].reverse();
  const all: FluxyMessageData[] = [];
  for (const id of ordered) {
    const m = await store.get<FluxyMessageData>(messageKey(input.orgId, input.boardId, id));
    if (m) all.push(m);
  }
  all.sort(compareMessageDesc);
  const filtered = decodedCursor
    ? all.filter((m) =>
        new Date(m.createdAt).getTime() < new Date(decodedCursor.createdAt).getTime() ||
        (m.createdAt === decodedCursor.createdAt && m.id < decodedCursor.id)
      )
    : all;
  const items = filtered.slice(0, limit);
  const tail = items.at(-1);
  return { items, nextCursor: tail ? encodeCursor({ createdAt: tail.createdAt, id: tail.id }) : null };
}
