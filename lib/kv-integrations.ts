import { randomBytes } from "crypto";
import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";

const COL_CONNECTIONS = "integration_connections";
const COL_EVENT_LOGS = "integration_event_logs";
const KV_CONNECTIONS_PREFIX = "integration_connections:";
const KV_EVENT_LOGS_PREFIX = "integration_event_logs:";

export type IntegrationProvider = "github" | "gitlab";
export type IntegrationStatus = "connected" | "disconnected";

export type IntegrationConnection = {
  _id: string;
  orgId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  accountLabel?: string | null;
  externalOrgId?: string | null;
  webhookSecret?: string | null;
  /** GitHub App installation id (stringified) for outbound API. */
  installationId?: string | null;
  /** AES-GCM blob via FLUX_AI_SECRETS_KEY — PEM or app private key material. */
  appPrivateKeyEnc?: string | null;
  /** GitHub App ID (numeric string). */
  githubAppId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationEventLog = {
  _id: string;
  orgId: string;
  provider: IntegrationProvider;
  eventType: string;
  status?: "received" | "synced" | "ignored" | "failed";
  message?: string | null;
  deliveryId?: string | null;
  receivedAt: string;
};

function mkId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`;
}

export async function getIntegrationConnection(
  orgId: string,
  provider: IntegrationProvider
): Promise<IntegrationConnection | null> {
  if (!isMongoConfigured()) {
    const store = await getStore();
    return (await store.get<IntegrationConnection>(`${KV_CONNECTIONS_PREFIX}${orgId}:${provider}`)) ?? null;
  }
  const db = await getDb();
  const doc = await db.collection<IntegrationConnection>(COL_CONNECTIONS).findOne({ orgId, provider });
  return doc ?? null;
}

export async function getIntegrationConnectionByExternalOrg(params: {
  provider: IntegrationProvider;
  externalOrgId: string;
}): Promise<IntegrationConnection | null> {
  const wanted = params.externalOrgId.trim().toLowerCase();
  if (!wanted) return null;
  if (!isMongoConfigured()) {
    const list = await listIntegrationConnections();
    return (
      list.find(
        (x) =>
          x.provider === params.provider &&
          x.status === "connected" &&
          String(x.externalOrgId ?? "").trim().toLowerCase() === wanted
      ) ?? null
    );
  }
  const db = await getDb();
  return (
    (await db.collection<IntegrationConnection>(COL_CONNECTIONS).findOne({
      provider: params.provider,
      status: "connected",
      externalOrgId: params.externalOrgId,
    })) ?? null
  );
}

export async function upsertIntegrationConnection(params: {
  orgId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  accountLabel?: string | null;
  externalOrgId?: string | null;
  webhookSecret?: string | null;
  installationId?: string | null;
  appPrivateKeyEnc?: string | null;
  githubAppId?: string | null;
}): Promise<IntegrationConnection> {
  const now = new Date().toISOString();
  const existing = await getIntegrationConnection(params.orgId, params.provider);
  const next: IntegrationConnection = {
    _id: existing?._id ?? mkId("int"),
    orgId: params.orgId,
    provider: params.provider,
    status: params.status,
    accountLabel: params.accountLabel ?? existing?.accountLabel ?? null,
    externalOrgId: params.externalOrgId ?? existing?.externalOrgId ?? null,
    webhookSecret: params.webhookSecret ?? existing?.webhookSecret ?? null,
    installationId: params.installationId ?? existing?.installationId ?? null,
    appPrivateKeyEnc: params.appPrivateKeyEnc ?? existing?.appPrivateKeyEnc ?? null,
    githubAppId: params.githubAppId ?? existing?.githubAppId ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (!isMongoConfigured()) {
    const store = await getStore();
    await store.set(`${KV_CONNECTIONS_PREFIX}${params.orgId}:${params.provider}`, next);
    return next;
  }

  const db = await getDb();
  await db.collection<IntegrationConnection>(COL_CONNECTIONS).updateOne(
    { orgId: params.orgId, provider: params.provider },
    { $set: next },
    { upsert: true }
  );
  return next;
}

export async function appendIntegrationEventLog(input: {
  orgId: string;
  provider: IntegrationProvider;
  eventType: string;
  status?: "received" | "synced" | "ignored" | "failed";
  message?: string | null;
  deliveryId?: string | null;
}): Promise<void> {
  const log: IntegrationEventLog = {
    _id: mkId("intlog"),
    orgId: input.orgId,
    provider: input.provider,
    eventType: input.eventType,
    status: input.status ?? "received",
    message: input.message ?? null,
    deliveryId: input.deliveryId ?? null,
    receivedAt: new Date().toISOString(),
  };

  if (!isMongoConfigured()) {
    const store = await getStore();
    const key = `${KV_EVENT_LOGS_PREFIX}${input.orgId}:${input.provider}`;
    const current = (await store.get<IntegrationEventLog[]>(key)) ?? [];
    await store.set(key, [log, ...current].slice(0, 100));
    return;
  }

  const db = await getDb();
  await db.collection<IntegrationEventLog>(COL_EVENT_LOGS).insertOne(log);
}

export async function listIntegrationEventLogs(params?: {
  orgId?: string;
  provider?: IntegrationProvider;
  limit?: number;
}): Promise<IntegrationEventLog[]> {
  const lim = Math.min(Math.max(params?.limit ?? 100, 1), 500);
  if (!isMongoConfigured()) {
    const store = await getStore();
    const key = params?.orgId && params?.provider ? `${KV_EVENT_LOGS_PREFIX}${params.orgId}:${params.provider}` : "";
    if (!key) return [];
    const current = (await store.get<IntegrationEventLog[]>(key)) ?? [];
    return current.slice(0, lim);
  }
  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (params?.orgId) filter.orgId = params.orgId;
  if (params?.provider) filter.provider = params.provider;
  return db
    .collection<IntegrationEventLog>(COL_EVENT_LOGS)
    .find(filter)
    .sort({ receivedAt: -1 })
    .limit(lim)
    .toArray();
}

async function listIntegrationConnections(): Promise<IntegrationConnection[]> {
  if (!isMongoConfigured()) {
    return [];
  }
  const db = await getDb();
  return db.collection<IntegrationConnection>(COL_CONNECTIONS).find({}).toArray();
}

