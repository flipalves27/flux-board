import crypto from "crypto";
import { getStore } from "./storage";

const MAX_SKEW_MS = 5 * 60 * 1000;
const REPLAY_PREFIX = "incoming_wh_replay:";

function secureCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function buildIncomingWebhookSignature(payload: string, timestamp: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

export function verifyIncomingWebhookSignature(params: {
  payload: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
}): { ok: boolean; reason?: string } {
  const tsRaw = params.timestamp?.trim() || "";
  const sigRaw = params.signature?.trim() || "";
  if (!tsRaw || !sigRaw) return { ok: false, reason: "missing_signature_headers" };

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid_timestamp" };
  if (Math.abs(Date.now() - ts) > MAX_SKEW_MS) return { ok: false, reason: "timestamp_out_of_window" };

  const expected = buildIncomingWebhookSignature(params.payload, tsRaw, params.secret);
  if (!secureCompare(expected, sigRaw)) return { ok: false, reason: "invalid_signature" };

  return { ok: true };
}

export async function ensureNoWebhookReplay(params: {
  boardId: string;
  orgId: string;
  timestamp: string;
  eventId: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const store = await getStore();
  const id = (params.eventId || "").trim();
  const replayKey = id
    ? `${REPLAY_PREFIX}${params.orgId}:${params.boardId}:event:${id}`
    : `${REPLAY_PREFIX}${params.orgId}:${params.boardId}:ts:${params.timestamp}`;

  const existing = await store.get<{ seenAt: number }>(replayKey);
  if (existing) return { ok: false, reason: "replay_detected" };
  await store.set(replayKey, { seenAt: Date.now() });
  return { ok: true };
}
