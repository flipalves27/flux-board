import { randomBytes } from "crypto";
import type { Db, ObjectId } from "mongodb";
import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";
import type { WebhookEventType } from "./webhook-types";

const COL_SUBS = "webhook_subscriptions";
const COL_OUTBOX = "webhook_outbox";
const COL_LOGS = "webhook_delivery_logs";

const MAX_LOGS_PER_ORG = 100;
const KV_SUBS_PREFIX = "webhook_subs:";
const KV_OUTBOX_PREFIX = "webhook_outbox:";
const KV_LOGS_PREFIX = "webhook_logs:";

export type WebhookSubscriptionStored = {
  _id: string;
  orgId: string;
  url: string;
  /** Plain secret for HMAC (at-rest protection is the database). */
  secret: string;
  events: WebhookEventType[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebhookSubscriptionPublic = Omit<WebhookSubscriptionStored, "secret"> & {
  secretHint: string;
};

export type WebhookOutboxDoc = {
  _id: ObjectId;
  orgId: string;
  subscriptionId: string;
  eventId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  attemptCount: number;
  nextAttemptAt: string;
  createdAt: string;
};

export type WebhookDeliveryLogDoc = {
  _id: ObjectId;
  orgId: string;
  subscriptionId: string;
  eventId: string;
  eventType: WebhookEventType;
  /** Snapshot of JSON body sent (or last attempt). */
  payload: Record<string, unknown>;
  status: "success" | "failed";
  attempts: number;
  httpStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string;
};

let indexesEnsured = false;

async function ensureWebhookIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection(COL_SUBS).createIndex({ orgId: 1, createdAt: -1 });
  await db.collection(COL_OUTBOX).createIndex({ orgId: 1, nextAttemptAt: 1 });
  await db.collection(COL_OUTBOX).createIndex({ nextAttemptAt: 1 });
  await db.collection(COL_LOGS).createIndex({ orgId: 1, completedAt: -1 });
  indexesEnsured = true;
}

function mkId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

function secretHint(secret: string): string {
  const s = String(secret || "");
  if (s.length <= 4) return "****";
  return `****${s.slice(-4)}`;
}

function toPublic(sub: WebhookSubscriptionStored): WebhookSubscriptionPublic {
  const { secret, ...rest } = sub;
  return { ...rest, secretHint: secretHint(secret) };
}

// --- KV memory helpers ---

type KvSubsState = { subs: WebhookSubscriptionStored[] };
type KvOutboxState = { items: Array<Omit<WebhookOutboxDoc, "_id"> & { _id: string }> };
type KvLogsState = { items: WebhookDeliveryLogDoc[] };

async function kvGetSubs(orgId: string): Promise<WebhookSubscriptionStored[]> {
  const store = await getStore();
  const raw = await store.get<KvSubsState>(KV_SUBS_PREFIX + orgId);
  return raw?.subs ?? [];
}

async function kvSetSubs(orgId: string, subs: WebhookSubscriptionStored[]): Promise<void> {
  const store = await getStore();
  await store.set(KV_SUBS_PREFIX + orgId, { subs });
}

async function kvGetOutbox(): Promise<KvOutboxState["items"]> {
  const store = await getStore();
  const raw = await store.get<KvOutboxState>(KV_OUTBOX_PREFIX + "all");
  return raw?.items ?? [];
}

async function kvSetOutbox(items: KvOutboxState["items"]): Promise<void> {
  const store = await getStore();
  await store.set(KV_OUTBOX_PREFIX + "all", { items });
}

async function kvGetLogs(orgId: string): Promise<WebhookDeliveryLogDoc[]> {
  const store = await getStore();
  const raw = await store.get<KvLogsState>(KV_LOGS_PREFIX + orgId);
  return raw?.items ?? [];
}

async function kvSetLogs(orgId: string, items: WebhookDeliveryLogDoc[]): Promise<void> {
  const store = await getStore();
  await store.set(KV_LOGS_PREFIX + orgId, { items });
}

function trimLogs(logs: WebhookDeliveryLogDoc[]): WebhookDeliveryLogDoc[] {
  return logs.slice(-MAX_LOGS_PER_ORG);
}

// --- Public API ---

export async function listWebhookSubscriptions(orgId: string): Promise<WebhookSubscriptionPublic[]> {
  if (!isMongoConfigured()) {
    const subs = await kvGetSubs(orgId);
    return subs.map(toPublic);
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  const docs = await db
    .collection<WebhookSubscriptionStored>(COL_SUBS)
    .find({ orgId })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(toPublic);
}

export async function getWebhookSubscription(
  orgId: string,
  subscriptionId: string
): Promise<WebhookSubscriptionStored | null> {
  if (!isMongoConfigured()) {
    const subs = await kvGetSubs(orgId);
    return subs.find((s) => s._id === subscriptionId) ?? null;
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  const doc = await db.collection<WebhookSubscriptionStored>(COL_SUBS).findOne({ _id: subscriptionId, orgId });
  return doc || null;
}

export async function createWebhookSubscription(params: {
  orgId: string;
  url: string;
  secret?: string;
  events: WebhookEventType[];
  active?: boolean;
}): Promise<{ subscription: WebhookSubscriptionStored; secret: string }> {
  const now = new Date().toISOString();
  const secret = params.secret?.trim() || randomBytes(32).toString("hex");
  const sub: WebhookSubscriptionStored = {
    _id: mkId("wh"),
    orgId: params.orgId,
    url: params.url.trim(),
    secret,
    events: params.events,
    active: params.active !== false,
    createdAt: now,
    updatedAt: now,
  };

  if (!isMongoConfigured()) {
    const subs = await kvGetSubs(params.orgId);
    subs.push(sub);
    await kvSetSubs(params.orgId, subs);
    return { subscription: sub, secret };
  }

  const db = await getDb();
  await ensureWebhookIndexes(db);
  await db.collection<WebhookSubscriptionStored>(COL_SUBS).insertOne(sub);
  return { subscription: sub, secret };
}

export async function updateWebhookSubscription(
  orgId: string,
  subscriptionId: string,
  updates: Partial<Pick<WebhookSubscriptionStored, "url" | "events" | "active" | "secret">>
): Promise<WebhookSubscriptionStored | null> {
  const existing = await getWebhookSubscription(orgId, subscriptionId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const next: WebhookSubscriptionStored = {
    ...existing,
    ...(updates.url !== undefined ? { url: updates.url.trim() } : {}),
    ...(updates.events !== undefined ? { events: updates.events } : {}),
    ...(updates.active !== undefined ? { active: updates.active } : {}),
    ...(updates.secret !== undefined && updates.secret.trim() ? { secret: updates.secret.trim() } : {}),
    updatedAt: now,
  };

  if (!isMongoConfigured()) {
    const subs = await kvGetSubs(orgId);
    const idx = subs.findIndex((s) => s._id === subscriptionId);
    if (idx < 0) return null;
    subs[idx] = next;
    await kvSetSubs(orgId, subs);
    return next;
  }

  const db = await getDb();
  await ensureWebhookIndexes(db);
  const patch: Record<string, unknown> = { updatedAt: now };
  if (updates.url !== undefined) patch.url = next.url;
  if (updates.events !== undefined) patch.events = next.events;
  if (updates.active !== undefined) patch.active = next.active;
  if (updates.secret !== undefined && updates.secret.trim()) patch.secret = next.secret.trim();
  await db.collection<WebhookSubscriptionStored>(COL_SUBS).updateOne({ _id: subscriptionId, orgId }, { $set: patch });
  return (await getWebhookSubscription(orgId, subscriptionId)) ?? next;
}

export async function deleteWebhookSubscription(orgId: string, subscriptionId: string): Promise<boolean> {
  if (!isMongoConfigured()) {
    const subs = await kvGetSubs(orgId);
    const next = subs.filter((s) => s._id !== subscriptionId);
    if (next.length === subs.length) return false;
    await kvSetSubs(orgId, next);
    const ob = (await kvGetOutbox()).filter((o) => !(o.orgId === orgId && o.subscriptionId === subscriptionId));
    await kvSetOutbox(ob);
    return true;
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  const r = await db.collection<WebhookSubscriptionStored>(COL_SUBS).deleteOne({ _id: subscriptionId, orgId });
  await db.collection(COL_OUTBOX).deleteMany({ orgId, subscriptionId });
  return r.deletedCount === 1;
}

export async function listActiveSubscriptionsForOrg(orgId: string): Promise<WebhookSubscriptionStored[]> {
  if (!isMongoConfigured()) {
    const subs = await kvGetSubs(orgId);
    return subs.filter((s) => s.active);
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  return db
    .collection<WebhookSubscriptionStored>(COL_SUBS)
    .find({ orgId, active: true })
    .toArray();
}

export async function insertOutboxDelivery(doc: Omit<WebhookOutboxDoc, "_id">): Promise<ObjectId | string> {
  if (!isMongoConfigured()) {
    const items = await kvGetOutbox();
    const id = mkId("wout");
    items.push({ ...doc, _id: id });
    await kvSetOutbox(items);
    return id;
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  const { ObjectId } = await import("mongodb");
  const _id = new ObjectId();
  await db.collection(COL_OUTBOX).insertOne({ ...doc, _id });
  return _id;
}

export async function updateOutboxDelivery(
  id: ObjectId | string,
  patch: Partial<Pick<WebhookOutboxDoc, "attemptCount" | "nextAttemptAt">>
): Promise<void> {
  if (!isMongoConfigured()) {
    const items = await kvGetOutbox();
    const idx = items.findIndex((x) => String(x._id) === String(id));
    if (idx < 0) return;
    items[idx] = { ...items[idx], ...patch };
    await kvSetOutbox(items);
    return;
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  const { ObjectId } = await import("mongodb");
  const oid = typeof id === "string" ? new ObjectId(id) : id;
  await db.collection(COL_OUTBOX).updateOne({ _id: oid }, { $set: patch });
}

export async function deleteOutboxDelivery(id: ObjectId | string): Promise<void> {
  if (!isMongoConfigured()) {
    const items = (await kvGetOutbox()).filter((x) => String(x._id) !== String(id));
    await kvSetOutbox(items);
    return;
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  const { ObjectId } = await import("mongodb");
  const oid = typeof id === "string" ? new ObjectId(id) : id;
  await db.collection(COL_OUTBOX).deleteOne({ _id: oid });
}

export async function getOutboxDeliveryById(
  id: ObjectId | string
): Promise<(WebhookOutboxDoc & { _id: ObjectId | string }) | null> {
  if (!isMongoConfigured()) {
    const items = await kvGetOutbox();
    return (items.find((x) => String(x._id) === String(id)) as
      | (WebhookOutboxDoc & { _id: ObjectId | string })
      | undefined) ?? null;
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  const { ObjectId } = await import("mongodb");
  const oid = typeof id === "string" ? new ObjectId(id) : id;
  const doc = await db.collection<WebhookOutboxDoc>(COL_OUTBOX).findOne({ _id: oid });
  return (doc as WebhookOutboxDoc & { _id: ObjectId }) || null;
}

export async function findDueOutboxDeliveries(limit: number, beforeIso: string): Promise<Array<WebhookOutboxDoc & { _id: ObjectId | string }>> {
  if (!isMongoConfigured()) {
    const items = await kvGetOutbox();
    return items
      .filter((x) => x.nextAttemptAt <= beforeIso)
      .slice(0, limit) as Array<WebhookOutboxDoc & { _id: ObjectId | string }>;
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  const docs = await db
    .collection<WebhookOutboxDoc>(COL_OUTBOX)
    .find({ nextAttemptAt: { $lte: beforeIso } })
    .sort({ nextAttemptAt: 1 })
    .limit(limit)
    .toArray();
  return docs as Array<WebhookOutboxDoc & { _id: ObjectId | string }>;
}

export async function appendDeliveryLog(orgId: string, log: Omit<WebhookDeliveryLogDoc, "_id">): Promise<void> {
  if (!isMongoConfigured()) {
    const { ObjectId } = await import("mongodb");
    const items = await kvGetLogs(orgId);
    items.push({ ...log, _id: new ObjectId() });
    await kvSetLogs(orgId, trimLogs(items));
    return;
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  const { ObjectId } = await import("mongodb");
  await db.collection(COL_LOGS).insertOne({ ...log, _id: new ObjectId() });
  await trimDeliveryLogsMongo(db, orgId);
}

async function trimDeliveryLogsMongo(db: Db, orgId: string): Promise<void> {
  const col = db.collection(COL_LOGS);
  const count = await col.countDocuments({ orgId });
  if (count <= MAX_LOGS_PER_ORG) return;
  const extra = count - MAX_LOGS_PER_ORG;
  const old = await col.find({ orgId }).sort({ completedAt: 1 }).limit(extra).project({ _id: 1 }).toArray();
  const ids = old.map((d) => d._id);
  if (ids.length) await col.deleteMany({ _id: { $in: ids } });
}

export async function listDeliveryLogs(orgId: string, limit: number): Promise<WebhookDeliveryLogDoc[]> {
  const lim = Math.min(Math.max(limit, 1), MAX_LOGS_PER_ORG);
  if (!isMongoConfigured()) {
    const items = await kvGetLogs(orgId);
    return items.slice(-lim).reverse();
  }
  const db = await getDb();
  await ensureWebhookIndexes(db);
  const docs = await db
    .collection<WebhookDeliveryLogDoc>(COL_LOGS)
    .find({ orgId })
    .sort({ completedAt: -1 })
    .limit(lim)
    .toArray();
  return docs;
}
