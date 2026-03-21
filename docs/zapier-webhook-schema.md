# Flux-Board outbound webhooks — Zapier / automation

This document describes the JSON envelope and signing model for building a **Zapier** (or Make, n8n) integration. The API is **Stripe/GitHub-inspired**: each delivery is a `POST` with a JSON body and an HMAC-SHA256 signature.

## Endpoint (subscriber)

Your server receives:

- **Method:** `POST`
- **Content-Type:** `application/json`
- **User-Agent:** `Flux-Board-Webhooks/1.0`

### Headers

| Header | Description |
|--------|-------------|
| `X-Flux-Event-Id` | Unique id for this logical event (same for all subscriptions on that emission). |
| `X-Flux-Event-Type` | Event name, e.g. `card.completed`. |
| `X-Flux-Delivery` | Outbox delivery id (per subscription attempt). |
| `X-Flux-Timestamp` | Unix timestamp (seconds) used in the signature. |
| `X-Flux-Signature` | `t=<unix>,v1=<hex>` — see **Signing** below. |

## JSON envelope

```json
{
  "id": "evt_xxx",
  "type": "card.completed",
  "created_at": "2025-03-21T12:00:00.000Z",
  "org_id": "org_xxx",
  "api_version": "2025-03-21",
  "data": { }
}
```

- **`type`** — one of: `card.created`, `card.moved`, `card.completed`, `card.deleted`, `board.updated`, `anomaly.triggered`, `form.submitted`, `okr.progress_changed`.
- **`data`** — event-specific payload (see examples below).

## Signing (HMAC-SHA256)

Given the raw JSON body string `body` (must match bytes sent) and shared **secret** configured in org settings:

1. Let `t` = Unix time in seconds (same as `X-Flux-Timestamp`).
2. Build `signed_payload = t + "." + body` (string concatenation, UTF-8).
3. `v1 = HMAC_SHA256(secret, signed_payload)` as lowercase hex.
4. Header: `X-Flux-Signature: t=<t>,v1=<v1>`

Verification (Node.js):

```javascript
import crypto from "crypto";

function verify(secret, body, header, maxSkewSec = 300) {
  const m = String(header || "").match(/t=(\d+),v1=([a-f0-9]+)/i);
  if (!m) return false;
  const t = Number(m[1]);
  const v1 = m[2];
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > maxSkewSec) return false;
  const signed = `${t}.${body}`;
  const expected = crypto.createHmac("sha256", secret).update(signed, "utf8").digest("hex");
  return crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
}
```

## Event `data` examples

### `card.completed`

```json
{
  "board_id": "b_1",
  "board_name": "Delivery",
  "card_id": "c_x",
  "bucket": "done",
  "title": "Ship feature"
}
```

### `form.submitted`

```json
{
  "form_slug": "intake-produto",
  "board_id": "b_1",
  "card_id": "FORM-XXX",
  "merged": false,
  "requester_name": "Ada",
  "requester_email": "ada@example.com"
}
```

### `anomaly.triggered`

```json
{
  "alert_id": "507f1f77bcf86cd799439011",
  "kind": "wip_explosion",
  "severity": "warning",
  "title": "…",
  "message": "…",
  "diagnostics": {},
  "board_id": "b_1",
  "board_name": "Delivery"
}
```

### `okr.progress_changed`

```json
{
  "key_result_id": "kr_xxx",
  "objective_id": "okr_obj_xxx",
  "title": "Reduce lead time",
  "metric_type": "Manual",
  "target": 10,
  "manual_current": 4,
  "linked_board_id": "b_1",
  "linked_column_key": null
}
```

## Retries

Failures are retried up to **3** times after the first attempt, with delays **10s**, **60s**, and **300s**. Configure a scheduled `GET` or `POST` to `/api/cron/webhook-deliveries` with header `x-cron-secret` matching `WEBHOOK_CRON_SECRET` (or the shared cron secret fallbacks) so retries are processed when the app does not execute the immediate microtask path.

## Zapier “Catch Hook” checklist

1. Create a Zap with **Webhooks by Zapier → Catch Hook**.
2. Copy the target URL into Flux-Board **Org settings → Webhooks**.
3. Select event types; save; trigger an event from Flux-Board.
4. In Zapier, map fields from the payload: use `type`, `data.board_id`, `data.card_id`, etc.

For production, verify `X-Flux-Signature` in a **Code** step or your own endpoint before trusting the body.
