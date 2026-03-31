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

/** Quantas mensagens user/assistant enviar ao LLM (histórico maior permanece persistido até MAX_MESSAGES_PER_CHAT). */
export function getCopilotLlmHistoryMessageLimit(): number {
  const raw = Number(process.env.COPILOT_LLM_HISTORY_MESSAGES ?? "20");
  if (!Number.isFinite(raw) || raw < 1) return 20;
  return Math.min(Math.floor(raw), 60);
}

export function sliceCopilotMessagesForLlm(
  messages: CopilotMessage[],
  limit: number = getCopilotLlmHistoryMessageLimit()
): CopilotMessage[] {
  const cap = Math.max(1, Math.min(limit, 60));
  const relevant = messages.filter((m) => m.role === "user" || m.role === "assistant");
  return relevant.slice(-cap);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function copilotRetentionMs(): number {
  const raw = Number(process.env.COPILOT_MESSAGE_RETENTION_DAYS ?? "90");
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 3650) : 90;
  return days * DAY_MS;
}

function pruneCopilotMessagesByAge(messages: CopilotMessage[]): CopilotMessage[] {
  const cutoff = Date.now() - copilotRetentionMs();
  return messages.filter((m) => {
    const t = Date.parse(m.createdAt);
    return Number.isFinite(t) && t >= cutoff;
  });
}

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
    if (doc) {
      const pruned = pruneCopilotMessagesByAge(doc.messages ?? []);
      if (pruned.length !== (doc.messages ?? []).length) {
        await col.updateOne(
          { orgId, boardId, userId },
          { $set: { messages: pruned, updatedAt: nowIso() } }
        );
        return { ...doc, messages: pruned, updatedAt: nowIso() };
      }
      return doc;
    }

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
  if (existing) {
    const pruned = pruneCopilotMessagesByAge(existing.messages ?? []);
    if (pruned.length !== (existing.messages ?? []).length) {
      const next = { ...existing, messages: pruned, updatedAt: nowIso() };
      await store.set(kvKey(orgId, boardId, userId), next);
      return next;
    }
    return existing;
  }

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

    // O segundo argumento de updateOne deve usar só operadores ($set, $push, …).
    // Não misturar o mesmo path em $setOnInsert e noutro operador (ex.: `messages`
    // em $setOnInsert + $push → "conflict at 'messages'").
    // Idem `freeDemoUsed`: não usar $setOnInsert { freeDemoUsed: 0 } com $inc no mesmo path.
    const setOnInsert: Record<string, unknown> = {
      orgId,
      boardId,
      userId,
      createdAt,
    };
    if (!incrementFreeDemoUsed) {
      setOnInsert.freeDemoUsed = 0;
    }

    const update: Record<string, unknown> = {
      $set: { updatedAt: createdAt },
      $setOnInsert: setOnInsert,
      $push: {
        messages: {
          $each: newMessages,
          $slice: -MAX_MESSAGES_PER_CHAT,
        },
      },
    };
    if (incrementFreeDemoUsed) {
      update.$inc = { freeDemoUsed: 1 };
    }

    await col.updateOne({ orgId, boardId, userId }, update, { upsert: true });

    // Rebusca para retornar o doc final (simples/robusto).
    const doc = await col.findOne({ orgId, boardId, userId });
    if (!doc) throw new Error("Falha ao persistir histórico do Copiloto.");
    const pruned = pruneCopilotMessagesByAge(doc.messages ?? []);
    if (pruned.length !== (doc.messages ?? []).length) {
      await col.updateOne({ orgId, boardId, userId }, { $set: { messages: pruned, updatedAt: nowIso() } });
      return { ...doc, messages: pruned, updatedAt: nowIso() };
    }
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
  const prior = pruneCopilotMessagesByAge(baseDoc.messages ?? []);
  const messages = [...prior, ...newMessages].slice(-MAX_MESSAGES_PER_CHAT);
  const next: CopilotChatDoc = {
    ...baseDoc,
    updatedAt: createdAt,
    freeDemoUsed,
    messages,
  };

  await store.set(key, next);
  return next;
}

