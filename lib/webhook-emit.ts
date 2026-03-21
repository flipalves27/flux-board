import type { BoardSnapshotForActivity } from "./board-activity-types";
import type { BoardData } from "./kv-boards";
import { deriveWebhookBoardEvents } from "./webhook-board-events";
import { enqueueWebhookDeliveriesForEvent } from "./webhook-delivery";

/**
 * Agenda webhooks após persistência do board (cards + configurações).
 */
export function scheduleWebhookBoardPersist(prev: BoardData, next: BoardData): void {
  queueMicrotask(() => {
    void (async () => {
      try {
        const orgId = String(next.orgId || "");
        if (!orgId) return;
        const events = deriveWebhookBoardEvents(
          prev as unknown as BoardSnapshotForActivity,
          next as unknown as BoardSnapshotForActivity
        );
        for (const ev of events) {
          await enqueueWebhookDeliveriesForEvent(orgId, ev.type, ev.data);
        }
      } catch (e) {
        console.error("[webhook-emit]", e);
      }
    })();
  });
}
