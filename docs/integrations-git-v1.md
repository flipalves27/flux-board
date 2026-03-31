# Git Integrations v1 (scaffold)

Initial v1 scaffold for organization-level GitHub/GitLab integrations.

## Organization connection endpoints

- `GET /api/integrations/github`
- `POST /api/integrations/github`
- `GET /api/integrations/gitlab`
- `POST /api/integrations/gitlab`

Auth:

- Requires authenticated org manager (or platform admin), same as org settings routes.

Payload (`POST`):

- `status`: `connected | disconnected`
- `accountLabel` (optional)
- `externalOrgId` (optional)
- `webhookSecret` (optional)

## Webhook endpoints

- `POST /api/integrations/github/webhook`
  - Signature validation with `GITHUB_WEBHOOK_SECRET` (if configured).
- `POST /api/integrations/gitlab/webhook`
  - Token validation with `GITLAB_WEBHOOK_SECRET` (if configured).
  - Replay protection by delivery id/request id (dedupe window).

Current behavior:

- Accept and log inbound event metadata for incremental rollout.
- Basic card sync:
  - Detects `cardId` pattern (`c_*`) from PR/MR branch/title/description.
  - On merged/closed, marks card as `Concluída` and appends integration tags/links.
- Returns `{ ok: true, queued: false }`.

## Next increments

- Bind webhook deliveries to real `orgId` using installation/group mapping.
- Implement card <-> PR synchronization.
- Add outbound comments/status updates from board lifecycle.

