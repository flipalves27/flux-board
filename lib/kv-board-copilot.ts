import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";
import type { Db } from "mongodb";
import { sanitizeText } from "./schemas";

export type CopilotMessageRole = "user" | "assistant" | "tool";

export type CopilotMessage = {
  id: string;
  role: CopilotMessageRole;
  content: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export type CopilotChatDoc = {
  boardId: string;
  orgId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  freeDemoUsed: number;
  messages: CopilotMessage[];
};

const COL_COPILOT_CHATS = "board_copilot_chats";

const MAX_MESSAGES_PER_CHAT = 80;
const MAX_MESSAGE_CONTENT_CHARS = 20_000;

function nowIso(): string {
  return new Date().toISOString();
}

function mkId(prefix: string = "m"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function kvKey(orgId: string, boardId: string, userId: string): string {
  return `board_copilot_chat:${orgId}:${boardId}:${userId}`;
}

async function ensureIndexes(db: Db): Promise<void> {
  const col = db.collection(COL_COPILOT_CHATS);
  await col.createIndex({ orgId: 1, boardId: 1, userId: 1 }, { unique: true });
  await col.createIndex({ updatedAt: 1 });
}

function sanitizeContent(content: unknown): string {
  const s = sanitizeText(content);
  const trimmed = s.slice(0, MAX_MESSAGE_CONTENT_CHARS);
  return trimmed;
}

export async function getBoardCopilotChat(params: {
  orgId: string;
  boardId: string;
  userId: string;
}): Promise<CopilotChatDoc> {
  const { orgId, boardId, userId } = params;

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const col = db.collection<CopilotChatDoc>(COL_COPILOT_CHATS);

    const doc = await col.findOne({ orgId, boardId, userId });
    if (doc) return doc;

    const createdAt = nowIso();
    return {
      boardId,
      orgId,
      userId,
      createdAt,
      updatedAt: createdAt,
      freeDemoUsed: 0,
      messages: [],
    };
  }

  const store = await getStore();
  const existing = await store.get<CopilotChatDoc>(kvKey(orgId, boardId, userId));
  if (existing) return existing;

  const createdAt = nowIso();
  return {
    boardId,
    orgId,
    userId,
    createdAt,
    updatedAt: createdAt,
    freeDemoUsed: 0,
    messages: [],
  };
}

export async function appendBoardCopilotMessages(params: {
  orgId: string;
  boardId: string;
  userId: string;
  /**
   * Incrementa o contador apenas para o tier `free` (limitando o número de mensagens demo).
   */
  incrementFreeDemoUsed?: boolean;
  messagesToAppend: Array<{
    role: CopilotMessageRole;
    content: unknown;
    meta?: Record<string, unknown>;
  }>;
}): Promise<CopilotChatDoc> {
  const { orgId, boardId, userId, incrementFreeDemoUsed, messagesToAppend } = params;
  if (!messagesToAppend.length) return getBoardCopilotChat({ orgId, boardId, userId });

  const createdAt = nowIso();
  const newMessages: CopilotMessage[] = messagesToAppend.map((m) => ({
    id: mkId(m.role),
    role: m.role,
    content: sanitizeContent(m.content),
    createdAt: createdAt,
    meta: m.meta,
  }));

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const col = db.collection<CopilotChatDoc>(COL_COPILOT_CHATS);

    const base = {
      orgId,
      boardId,
      userId,
      updatedAt: createdAt,
      $setOnInsert: {
        createdAt,
        freeDemoUsed: 0,
        messages: [],
      },
    } as const;

    const inc = incrementFreeDemoUsed ? { freeDemoUsed: 1 } : undefined;

    await col.updateOne(
      { orgId, boardId, userId },
      {
        ...base,
        ...(inc ? { $inc: inc } : {}),
        $push: {
          messages: {
            $each: newMessages,
            $slice: -MAX_MESSAGES_PER_CHAT,
          },
        },
      } as any,
      { upsert: true }
    );

    // Rebusca para retornar o doc final (simples/robusto).
    const doc = await col.findOne({ orgId, boardId, userId });
    if (!doc) throw new Error("Falha ao persistir histórico do Copiloto.");
    return doc;
  }

  const store = await getStore();
  const key = kvKey(orgId, boardId, userId);
  const existing = await store.get<CopilotChatDoc>(key);
  const baseDoc = existing ?? {
    boardId,
    orgId,
    userId,
    createdAt,
    updatedAt: createdAt,
    freeDemoUsed: 0,
    messages: [],
  };

  const freeDemoUsed = baseDoc.freeDemoUsed + (incrementFreeDemoUsed ? 1 : 0);
  const messages = [...(baseDoc.messages ?? []), ...newMessages].slice(-MAX_MESSAGES_PER_CHAT);
  const next: CopilotChatDoc = {
    ...baseDoc,
    updatedAt: createdAt,
    freeDemoUsed,
    messages,
  };

  await store.set(key, next);
  return next;
}

