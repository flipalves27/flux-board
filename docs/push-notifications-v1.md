# Push Notifications v1 (scaffold)

This increment enables PWA push registration flow:

- Browser asks for notification permission.
- Service worker subscription is created (`PushManager.subscribe`).
- Subscription is persisted per user/org via API.

## API

- `GET /api/users/me/push-subscriptions`
- `POST /api/users/me/push-subscriptions`
- `DELETE /api/users/me/push-subscriptions`
- `POST /api/push/notify` (enqueue org push notifications)
- `GET /api/cron/push-dispatch` (dispatch due queue, cron protected)

## UI

- `PushNotificationsSettings` in organization settings page.

## Required env

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for browser subscription.

## Next increments

- Per-event routing automation from domain events (mentions, due dates, blocked cards).
- Delivery dashboard for push outbox/retries.

