# Git Integrations v1 (scaffold)

Initial v1 scaffold for organization-level GitHub/GitLab integrations.

## Escopo cirúrgico (ICP)

Objetivo **não** é paridade com Jira ou um catálogo amplo de eventos. Para o ICP (squads produto+ops, times híbridos, consultoria de fluxo), o v1 prioriza:

- **Ligação card ↔ branch/PR/MR** e fechamento de laço quando o merge ocorre.
- **Webhooks inbound** com verificação de assinatura e dedupe.
- **Automação mínima de estado** no cartão (tags/links), auditável.

Fora do escopo curto: replicação de Issues como ITSM, comentários bidirecionais completos e “qualquer evento do GitHub”. Ver [posicionamento ICP e moat](strategy/posicionamento-icp-e-moat.md#5-integrações-cirúrgicas-github-gitlab-e-api-pública).

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

