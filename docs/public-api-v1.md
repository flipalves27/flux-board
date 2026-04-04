# Public API v1 (beta)

Base path: `/api/public/v1`

## Authentication

- Header required: `x-api-key: <key>`
- Current v1 configuration is environment-based:
  - Legacy single token:
    - `PUBLIC_API_V1_KEY`
    - `PUBLIC_API_V1_ORG_ID`
    - optional `PUBLIC_API_V1_SCOPES` (comma-separated)
  - Preferred multi-token config:
    - `PUBLIC_API_V1_TOKENS_JSON`
    - JSON array: `[{ "key": "...", "orgId": "...", "scopes": ["boards:read","cards:read"] }]`

If the key is invalid, API returns `401`.
If the public API is not configured, API returns `503`.
If request rate exceeds configured window, API returns `429`.

Rate-limit envs (optional):

- `PUBLIC_API_V1_RATE_LIMIT_WINDOW_MS` (default `60000`)
- `PUBLIC_API_V1_RATE_LIMIT_READ` (default `240`)
- `PUBLIC_API_V1_RATE_LIMIT_WRITE` (default `90`)

## OpenAPI document

- Endpoint: `GET /api/public/v1/openapi`
- Returns OpenAPI 3.1 JSON contract for v1.

## Endpoints

### `GET /api/public/v1/boards`

Lists boards for the configured organization.

Query params:

- `page` (optional, default `1`)
- `limit` (optional, default `20`, max `100`)
- `q` (optional, name search)

Response:

- `items`: array of board summaries
- `page`, `limit`, `total`

Scope required: `boards:read`

### `GET /api/public/v1/cards`

Lists cards flattened from board documents.

Query params:

- `page`, `limit`
- `boardId` (optional)
- `q` (optional search in id/title)
- `bucket` (optional)

Scope required: `cards:read`

### `POST /api/public/v1/cards`

Creates a card in a board.

Scope required: `cards:write`

### `PATCH /api/public/v1/cards`

Updates a card in a board.

Scope required: `cards:write`

### `GET /api/public/v1/sprints`

Lists sprints.

Query params:

- `page`, `limit`
- `boardId` (optional)
- `status` (optional: `planning|active|review|closed`)

Scope required: `sprints:read`

### `POST /api/public/v1/sprints`

Creates a sprint.

Scope required: `sprints:write`

### `PATCH /api/public/v1/sprints`

Updates sprint metadata/status.

Scope required: `sprints:write`

### `GET /api/public/v1/comments`

Lists comments for one card.

Query params:

- `boardId` (required)
- `cardId` (required)
- `page`, `limit`

Scope required: `comments:read`

### `POST /api/public/v1/comments`

Creates a comment for a card.

Scope required: `comments:write`

## Notes

- v1 is intentionally narrow and stable-first.
- Next increments should add write endpoints and stricter per-token rotation/audit.

## Token lifecycle (admin)

Platform admin endpoints:

- `GET /api/admin/public-api-tokens`
- `POST /api/admin/public-api-tokens`
- `POST /api/admin/public-api-tokens/{id}` (rotate)
- `DELETE /api/admin/public-api-tokens/{id}` (revoke)

The raw key is returned only on create/rotate.

