import { createHmac, randomBytes } from "crypto";
import type { ObjectId } from "mongodb";
import type { FluxWebhookEnvelope, WebhookEventType } from "./webhook-types";
import {
  appendDeliveryLog,
  deleteOutboxDelivery,
  findDueOutboxDeliveries,
  getOutboxDeliveryById,
  getWebhookSubscription,
  insertOutboxDelivery,
  listActiveSubscriptionsForOrg,
  updateOutboxDelivery,
  type WebhookOutboxDoc,
} from "./kv-webhooks";

const RETRY_AFTER_MS = [10_000, 60_000, 300_000];
const MAX_ATTEMPTS = 4;
const RESPONSE_BODY_MAX = 8000;
const FETCH_TIMEOUT_MS = 25_000;

function mkEventId(): string {
  return `evt_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
}

function buildEnvelope(
  orgId: string,
  type: WebhookEventType,
  data: Record<string, unknown>,
  eventId: string
): FluxWebhookEnvelope {
  return {
    id: eventId,
    type,
    created_at: new Date().toISOString(),
    org_id: orgId,
    api_version: "2025-03-21",
    data,
  };
}

function signBody(secret: string, timestampSec: number, rawBody: string): string {
  const signedPayload = `${timestampSec}.${rawBody}`;
  return createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
}

function truncateResponse(text: string): string {
  const t = String(text || "");
  if (t.length <= RESPONSE_BODY_MAX) return t;
  return `${t.slice(0, RESPONSE_BODY_MAX)}…`;
}

/**
 * Enfileira entrega para todas as subscriptions ativas que escutam `type`.
 */
export async function enqueueWebhookDeliveriesForEvent(
  orgId: string,
  type: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  const subs = await listActiveSubscriptionsForOrg(orgId);
  const targets = subs.filter((s) => s.events.includes(type));
  if (!targets.length) return;

  const eventId = mkEventId();
  const envelope = buildEnvelope(orgId, type, data, eventId);
  const now = new Date().toISOString();

  for (const sub of targets) {
    const outbox: Omit<WebhookOutboxDoc, "_id"> = {
      orgId,
      subscriptionId: sub._id,
      eventId,
      eventType: type,
      payload: envelope as unknown as Record<string, unknown>,
      attemptCount: 0,
      nextAttemptAt: now,
      createdAt: now,
    };
    const oid = await insertOutboxDelivery(outbox);
    queueMicrotask(() => {
      void processOutboxDeliveryById(oid);
    });
  }
}

async function processOutboxDeliveryById(outboxId: ObjectId | string): Promise<void> {
  try {
    await runDeliveryAttempt(outboxId);
  } catch (e) {
    console.error("[webhook-delivery]", e);
  }
}

async function runDeliveryAttempt(outboxId: ObjectId | string): Promise<void> {
  const doc = await getOutboxDeliveryById(outboxId);
  if (!doc) return;

  const sub = await getWebhookSubscription(doc.orgId, doc.subscriptionId);
  if (!sub || !sub.active) {
    await deleteOutboxDelivery(doc._id);
    return;
  }

  const attemptCount = doc.attemptCount + 1;
  const envelope = doc.payload as unknown as FluxWebhookEnvelope;
  const rawBody = JSON.stringify(envelope);
  const timestampSec = Math.floor(Date.now() / 1000);
  const sig = signBody(sub.secret, timestampSec, rawBody);

  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Flux-Board-Webhooks/1.0",
        "X-Flux-Event-Id": doc.eventId,
        "X-Flux-Event-Type": doc.eventType,
        "X-Flux-Delivery": String(doc._id),
        "X-Flux-Timestamp": String(timestampSec),
        "X-Flux-Signature": `t=${timestampSec},v1=${sig}`,
      },
      body: rawBody,
      signal: ac.signal,
    });
    clearTimeout(t);
    httpStatus = res.status;
    const text = await res.text().catch(() => "");
    responseBody = truncateResponse(text);

    if (res.ok) {
      await appendDeliveryLog(doc.orgId, {
        orgId: doc.orgId,
        subscriptionId: doc.subscriptionId,
        eventId: doc.eventId,
        eventType: doc.eventType,
        payload: envelope as unknown as Record<string, unknown>,
        status: "success",
        attempts: attemptCount,
        httpStatus,
        responseBody,
        errorMessage: null,
        createdAt: doc.createdAt,
        completedAt: new Date().toISOString(),
      });
      await deleteOutboxDelivery(doc._id);
      return;
    }

    errorMessage = `HTTP ${res.status}`;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  if (attemptCount >= MAX_ATTEMPTS) {
    await appendDeliveryLog(doc.orgId, {
      orgId: doc.orgId,
      subscriptionId: doc.subscriptionId,
      eventId: doc.eventId,
      eventType: doc.eventType,
      payload: envelope as unknown as Record<string, unknown>,
      status: "failed",
      attempts: attemptCount,
      httpStatus,
      responseBody,
      errorMessage,
      createdAt: doc.createdAt,
      completedAt: new Date().toISOString(),
    });
    await deleteOutboxDelivery(doc._id);
    return;
  }

  const delay = RETRY_AFTER_MS[attemptCount - 1] ?? RETRY_AFTER_MS[RETRY_AFTER_MS.length - 1];
  const next = new Date(Date.now() + delay).toISOString();
  await updateOutboxDelivery(doc._id, {
    attemptCount,
    nextAttemptAt: next,
  });
}

/**
 * Cron: processa entregas agendadas (retries).
 */
export async function processWebhookOutboxCron(limit = 30): Promise<{ processed: number }> {
  const now = new Date().toISOString();
  const due = await findDueOutboxDeliveries(limit, now);
  let processed = 0;
  for (const d of due) {
    await runDeliveryAttempt(d._id);
    processed++;
  }
  return { processed };
}
