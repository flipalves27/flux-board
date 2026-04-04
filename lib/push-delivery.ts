import webpush from "web-push";
import {
  deletePushOutboxItem,
  deletePushSubscription,
  findDuePushOutbox,
  listPushSubscriptions,
  updatePushOutboxRetry,
} from "./kv-push-subscriptions";

function configureVapid(): boolean {
  const subject = process.env.VAPID_SUBJECT?.trim();
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const prv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !pub || !prv) return false;
  webpush.setVapidDetails(subject, pub, prv);
  return true;
}

function retryDelayMs(attempt: number): number {
  const base = 30_000;
  return Math.min(30 * 60_000, base * Math.pow(2, Math.max(0, attempt)));
}

export async function dispatchDuePushOutbox(limit = 100): Promise<{
  processed: number;
  delivered: number;
  failed: number;
}> {
  if (!configureVapid()) {
    return { processed: 0, delivered: 0, failed: 0 };
  }
  const due = await findDuePushOutbox(limit);
  let delivered = 0;
  let failed = 0;
  for (const item of due) {
    const subs = await listPushSubscriptions(item.orgId, item.userId);
    const sub = subs.find((s) => s.endpoint === item.endpoint);
    if (!sub) {
      await deletePushOutboxItem(item._id);
      continue;
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.keys.auth ?? "",
            p256dh: sub.keys.p256dh ?? "",
          },
        },
        JSON.stringify(item.payload)
      );
      await deletePushOutboxItem(item._id);
      delivered += 1;
    } catch (e) {
      const statusCode = (e as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await deletePushSubscription(item.orgId, item.userId, item.endpoint);
        await deletePushOutboxItem(item._id);
      } else {
        const nextAttempt = item.attemptCount + 1;
        if (nextAttempt >= 6) {
          await deletePushOutboxItem(item._id);
        } else {
          const when = new Date(Date.now() + retryDelayMs(nextAttempt)).toISOString();
          await updatePushOutboxRetry(item._id, nextAttempt, when);
        }
      }
      failed += 1;
    }
  }
  return { processed: due.length, delivered, failed };
}

