import { randomBytes } from "crypto";
import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";

const COL_PUSH_SUBS = "push_subscriptions";
const COL_PUSH_OUTBOX = "push_outbox";
const KV_PUSH_SUBS_PREFIX = "push_subscriptions:";
const KV_PUSH_OUTBOX = "push_outbox";

export type PushPreferenceKey = "mentions" | "due_dates" | "blocked_cards";

export type PushSubscriptionRecord = {
  _id: string;
  orgId: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh?: string;
    auth?: string;
  };
  preferences: Record<PushPreferenceKey, boolean>;
  createdAt: string;
  updatedAt: string;
};

export type PushOutboxItem = {
  _id: string;
  orgId: string;
  userId: string;
  endpoint: string;
  payload: {
    title: string;
    body?: string;
    url?: string;
  };
  attemptCount: number;
  nextAttemptAt: string;
  createdAt: string;
};

function mkId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`;
}

function defaultPreferences(): Record<PushPreferenceKey, boolean> {
  return { mentions: true, due_dates: true, blocked_cards: true };
}

export async function listPushSubscriptions(orgId: string, userId: string): Promise<PushSubscriptionRecord[]> {
  if (!isMongoConfigured()) {
    const store = await getStore();
    return (await store.get<PushSubscriptionRecord[]>(`${KV_PUSH_SUBS_PREFIX}${orgId}:${userId}`)) ?? [];
  }
  const db = await getDb();
  return db.collection<PushSubscriptionRecord>(COL_PUSH_SUBS).find({ orgId, userId }).sort({ updatedAt: -1 }).toArray();
}

export async function listPushSubscriptionsForOrg(orgId: string, limit = 500): Promise<PushSubscriptionRecord[]> {
  const lim = Math.min(Math.max(limit, 1), 1000);
  if (!isMongoConfigured()) {
    return [];
  }
  const db = await getDb();
  return db.collection<PushSubscriptionRecord>(COL_PUSH_SUBS).find({ orgId }).limit(lim).toArray();
}

export async function upsertPushSubscription(input: {
  orgId: string;
  userId: string;
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
  preferences?: Partial<Record<PushPreferenceKey, boolean>>;
}): Promise<PushSubscriptionRecord> {
  const now = new Date().toISOString();
  const preferences = { ...defaultPreferences(), ...(input.preferences ?? {}) };
  const existing = (await listPushSubscriptions(input.orgId, input.userId)).find((x) => x.endpoint === input.endpoint) ?? null;

  const next: PushSubscriptionRecord = {
    _id: existing?._id ?? mkId("push"),
    orgId: input.orgId,
    userId: input.userId,
    endpoint: input.endpoint,
    keys: input.keys ?? existing?.keys ?? {},
    preferences,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (!isMongoConfigured()) {
    const store = await getStore();
    const key = `${KV_PUSH_SUBS_PREFIX}${input.orgId}:${input.userId}`;
    const current = await listPushSubscriptions(input.orgId, input.userId);
    const filtered = current.filter((x) => x.endpoint !== input.endpoint);
    await store.set(key, [next, ...filtered].slice(0, 20));
    return next;
  }

  const db = await getDb();
  await db.collection<PushSubscriptionRecord>(COL_PUSH_SUBS).updateOne(
    { orgId: input.orgId, userId: input.userId, endpoint: input.endpoint },
    { $set: next },
    { upsert: true }
  );
  return next;
}

export async function deletePushSubscription(orgId: string, userId: string, endpoint: string): Promise<boolean> {
  if (!isMongoConfigured()) {
    const store = await getStore();
    const key = `${KV_PUSH_SUBS_PREFIX}${orgId}:${userId}`;
    const current = await listPushSubscriptions(orgId, userId);
    const next = current.filter((x) => x.endpoint !== endpoint);
    await store.set(key, next);
    return next.length !== current.length;
  }

  const db = await getDb();
  const res = await db.collection<PushSubscriptionRecord>(COL_PUSH_SUBS).deleteOne({ orgId, userId, endpoint });
  return res.deletedCount === 1;
}

export async function enqueuePushOutbox(input: Omit<PushOutboxItem, "_id" | "attemptCount" | "createdAt">): Promise<string> {
  const now = new Date().toISOString();
  const item: PushOutboxItem = {
    _id: mkId("pushq"),
    attemptCount: 0,
    createdAt: now,
    ...input,
  };
  if (!isMongoConfigured()) {
    const store = await getStore();
    const current = (await store.get<PushOutboxItem[]>(KV_PUSH_OUTBOX)) ?? [];
    await store.set(KV_PUSH_OUTBOX, [item, ...current].slice(0, 5000));
    return item._id;
  }
  const db = await getDb();
  await db.collection<PushOutboxItem>(COL_PUSH_OUTBOX).insertOne(item);
  return item._id;
}

export async function findDuePushOutbox(limit = 100): Promise<PushOutboxItem[]> {
  const now = new Date().toISOString();
  const lim = Math.min(Math.max(limit, 1), 500);
  if (!isMongoConfigured()) {
    const store = await getStore();
    const current = (await store.get<PushOutboxItem[]>(KV_PUSH_OUTBOX)) ?? [];
    return current.filter((x) => x.nextAttemptAt <= now).slice(0, lim);
  }
  const db = await getDb();
  return db
    .collection<PushOutboxItem>(COL_PUSH_OUTBOX)
    .find({ nextAttemptAt: { $lte: now } })
    .sort({ nextAttemptAt: 1 })
    .limit(lim)
    .toArray();
}

export async function updatePushOutboxRetry(id: string, attemptCount: number, nextAttemptAt: string): Promise<void> {
  if (!isMongoConfigured()) {
    const store = await getStore();
    const current = (await store.get<PushOutboxItem[]>(KV_PUSH_OUTBOX)) ?? [];
    await store.set(
      KV_PUSH_OUTBOX,
      current.map((x) => (x._id === id ? { ...x, attemptCount, nextAttemptAt } : x))
    );
    return;
  }
  const db = await getDb();
  await db.collection<PushOutboxItem>(COL_PUSH_OUTBOX).updateOne({ _id: id }, { $set: { attemptCount, nextAttemptAt } });
}

export async function deletePushOutboxItem(id: string): Promise<void> {
  if (!isMongoConfigured()) {
    const store = await getStore();
    const current = (await store.get<PushOutboxItem[]>(KV_PUSH_OUTBOX)) ?? [];
    await store.set(KV_PUSH_OUTBOX, current.filter((x) => x._id !== id));
    return;
  }
  const db = await getDb();
  await db.collection<PushOutboxItem>(COL_PUSH_OUTBOX).deleteOne({ _id: id });
}

export async function listPushOutbox(params?: {
  orgId?: string;
  limit?: number;
}): Promise<PushOutboxItem[]> {
  const lim = Math.min(Math.max(params?.limit ?? 100, 1), 500);
  if (!isMongoConfigured()) {
    const store = await getStore();
    const current = (await store.get<PushOutboxItem[]>(KV_PUSH_OUTBOX)) ?? [];
    const filtered = params?.orgId ? current.filter((x) => x.orgId === params.orgId) : current;
    return filtered.slice(0, lim);
  }
  const db = await getDb();
  const filter = params?.orgId ? { orgId: params.orgId } : {};
  return db
    .collection<PushOutboxItem>(COL_PUSH_OUTBOX)
    .find(filter)
    .sort({ nextAttemptAt: 1 })
    .limit(lim)
    .toArray();
}

