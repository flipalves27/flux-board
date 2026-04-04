# Operations Panel v1

Minimal operational dashboard for daily auditing in Platform Admin.

## Location

- `Admin > Platform > Operations`

## Data sources

- Push outbox status (`push_outbox`)
- Git integration event logs (`integration_event_logs`)
- Public API active/revoked tokens (`public_api_tokens`)

## Backend endpoint

- `GET /api/admin/operations?limit=80`
- Optional filters:
  - `orgId`
  - `provider` (`github` | `gitlab`)
  - `status` (`received` | `synced` | `ignored` | `failed`)
  - `tokenState` (`active` | `revoked`)

Requires platform admin session.

## Operational routines

- Apply filters and click `Atualizar` for scoped triage.
- Export each section as CSV for daily evidence:
  - `push-outbox.csv`
  - `integration-logs.csv`
  - `public-api-tokens.csv`

