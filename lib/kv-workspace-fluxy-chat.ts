import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";
import type { Db } from "mongodb";
import { sanitizeText } from "./schemas";
import type { CopilotMessage, CopilotMessageRole } from "./kv-board-copilot";

export type WorkspaceFluxyChatDoc = {
  orgId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  freeDemoUsed: number;
  messages: CopilotMessage[];
};

const COL = "workspace_fluxy_chats";

const MAX_MESSAGES_PER_CHAT = 80;
const MAX_MESSAGE_CONTENT_CHARS = 20_000;

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

function kvKey(orgId: string, userId: string): string {
  return `workspace_fluxy_chat:${orgId}:${userId}`;
}

async function ensureIndexes(db: Db): Promise<void> {
  const col = db.collection(COL);
  await col.createIndex({ orgId: 1, userId: 1 }, { unique: true });
  await col.createIndex({ updatedAt: 1 });
}

function sanitizeContent(content: unknown): string {
  const s = sanitizeText(content);
  return s.slice(0, MAX_MESSAGE_CONTENT_CHARS);
}

export async function getWorkspaceFluxyChat(params: { orgId: string; userId: string }): Promise<WorkspaceFluxyChatDoc> {
  const { orgId, userId } = params;

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const col = db.collection<WorkspaceFluxyChatDoc>(COL);

    const doc = await col.findOne({ orgId, userId });
    if (doc) {
      const pruned = pruneCopilotMessagesByAge(doc.messages ?? []);
      if (pruned.length !== (doc.messages ?? []).length) {
        await col.updateOne({ orgId, userId }, { $set: { messages: pruned, updatedAt: nowIso() } });
        return { ...doc, messages: pruned, updatedAt: nowIso() };
      }
      return doc;
    }

    const createdAt = nowIso();
    return {
      orgId,
      userId,
      createdAt,
      updatedAt: createdAt,
      freeDemoUsed: 0,
      messages: [],
    };
  }

  const store = await getStore();
  const existing = await store.get<WorkspaceFluxyChatDoc>(kvKey(orgId, userId));
  if (existing) {
    const pruned = pruneCopilotMessagesByAge(existing.messages ?? []);
    if (pruned.length !== (existing.messages ?? []).length) {
      const next = { ...existing, messages: pruned, updatedAt: nowIso() };
      await store.set(kvKey(orgId, userId), next);
      return next;
    }
    return existing;
  }

  const createdAt = nowIso();
  return {
    orgId,
    userId,
    createdAt,
    updatedAt: createdAt,
    freeDemoUsed: 0,
    messages: [],
  };
}

export async function appendWorkspaceFluxyMessages(params: {
  orgId: string;
  userId: string;
  incrementFreeDemoUsed?: boolean;
  messagesToAppend: Array<{
    role: CopilotMessageRole;
    content: unknown;
    meta?: Record<string, unknown>;
  }>;
}): Promise<WorkspaceFluxyChatDoc> {
  const { orgId, userId, incrementFreeDemoUsed, messagesToAppend } = params;
  if (!messagesToAppend.length) return getWorkspaceFluxyChat({ orgId, userId });

  const createdAt = nowIso();

  const newMessages: CopilotMessage[] = messagesToAppend.map((m) => ({
    id: mkId(m.role),
    role: m.role,
    content: sanitizeContent(m.content),
    createdAt,
    meta: m.meta,
  }));

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const col = db.collection<WorkspaceFluxyChatDoc>(COL);

    const setOnInsert: Record<string, unknown> = {
      orgId,
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

    await col.updateOne({ orgId, userId }, update, { upsert: true });

    const doc = await col.findOne({ orgId, userId });
    if (!doc) throw new Error("Falha ao persistir histórico da Fluxy (workspace).");
    const pruned = pruneCopilotMessagesByAge(doc.messages ?? []);
    if (pruned.length !== (doc.messages ?? []).length) {
      await col.updateOne({ orgId, userId }, { $set: { messages: pruned, updatedAt: nowIso() } });
      return { ...doc, messages: pruned, updatedAt: nowIso() };
    }
    return doc;
  }

  const store = await getStore();
  const key = kvKey(orgId, userId);
  const existing = await store.get<WorkspaceFluxyChatDoc>(key);
  const baseDoc = existing ?? {
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
  const next: WorkspaceFluxyChatDoc = {
    ...baseDoc,
    updatedAt: createdAt,
    freeDemoUsed,
    messages,
  };

  await store.set(key, next);
  return next;
}
