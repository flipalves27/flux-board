import { getStore } from "./storage";

type ReplayValue = { expiresAt: string };

function keyFor(provider: "github" | "gitlab", deliveryId: string): string {
  return `webhook_replay:${provider}:${deliveryId}`;
}

export async function consumeWebhookDelivery(params: {
  provider: "github" | "gitlab";
  deliveryId: string | null;
  ttlSeconds?: number;
}): Promise<{ accepted: boolean; reason?: "missing_delivery_id" | "replay_detected" }> {
  const deliveryId = String(params.deliveryId ?? "").trim();
  if (!deliveryId) return { accepted: false, reason: "missing_delivery_id" };
  const ttlSeconds = Math.min(Math.max(params.ttlSeconds ?? 600, 60), 86_400);
  const store = await getStore();
  const key = keyFor(params.provider, deliveryId);
  const current = await store.get<ReplayValue>(key);
  const now = Date.now();
  if (current?.expiresAt && new Date(current.expiresAt).getTime() > now) {
    return { accepted: false, reason: "replay_detected" };
  }
  await store.set(key, { expiresAt: new Date(now + ttlSeconds * 1000).toISOString() });
  return { accepted: true };
}

