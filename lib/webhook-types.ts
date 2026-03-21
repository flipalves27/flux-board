export const WEBHOOK_EVENT_TYPES = [
  "card.created",
  "card.moved",
  "card.completed",
  "card.deleted",
  "board.updated",
  "anomaly.triggered",
  "form.submitted",
  "okr.progress_changed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function isWebhookEventType(s: string): s is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(s);
}

export type FluxWebhookEnvelope<T = Record<string, unknown>> = {
  id: string;
  type: WebhookEventType;
  created_at: string;
  org_id: string;
  api_version: "2025-03-21";
  data: T;
};
