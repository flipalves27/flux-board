# Modelo de ameaças (STRIDE) — Flux-Board

Documento vivo para reavaliação periódica. **Última revisão:** março/2026.

## Ativos sensíveis

| Ativo | Onde |
|--------|------|
| Credenciais de usuário (hash) | MongoDB `users` |
| Sessão (JWT access + refresh opaco) | Cookies httpOnly, coleção de refresh |
| Dados de board/cards por organização | MongoDB `boards` (campo `orgId`) |
| Segredos de integração (Stripe, webhooks outbound) | Env + documentos org |
| Tokens de portal/embed | `board.portal`, `embed` |
| Chaves de API LLM (Together, Anthropic, OpenAI) | Env servidor |
| Histórico Copilot | `board_copilot_chats` |

## Superfícies principais

- **App web same-origin:** Next.js App Router + Route Handlers sob `/api/*`.
- **Autenticação:** `getAuthFromRequest` ([`lib/auth.ts`](../lib/auth.ts)) — Bearer ou cookie `flux_access`.
- **Links não autenticados:** `/api/portal/[token]`, `/api/embed/[token]`, `/api/forms/[slug]`.
- **Crons Vercel / agendador:** `/api/cron/*` com header `x-cron-secret`.
- **Webhooks inbound:** Stripe [`app/api/billing/webhook`](../app/api/billing/webhook/route.ts).

## STRIDE por superfície

### Spoofing

- **Ameaça:** Atacante assume identidade de outro usuário ou org.
- **Controles:** JWT assinado com `JWT_SECRET`; refresh armazenado como hash; login com scrypt + `timingSafeEqual`.
- **Risco residual:** Roubo de token (XSS, malware) — mitigar com CSP, sanitização de conteúdo, SameSite em cookies.

### Tampering

- **Ameaça:** Alterar boards/cards de outra org (IDOR) ou payloads de webhook.
- **Controles:** `userCanAccessBoard` + `orgId` em `getBoard`/`updateBoard`; assinatura Stripe; HMAC em webhooks outbound ([`lib/webhook-delivery.ts`](../lib/webhook-delivery.ts)); validação anti-SSRF da URL antes do `fetch` e na criação/edição da subscription ([`lib/webhook-url.ts`](../lib/webhook-url.ts)).
- **Risco residual:** Bug em rota nova sem checagem — exigir checklist em PR para rotas `app/api/**`.

### Repudiation

- **Ameaça:** Negar ações críticas.
- **Controles:** Activity log em updates de board quando aplicável; logs de billing Stripe.
- **Risco residual:** Não há assinatura criptográfica por ação de usuário final — aceitável para o tier atual.

### Information disclosure

- **Ameaça:** Vazamento via CORS aberto, portal amplo, respostas de API ou prompts LLM.
- **Controles:** CORS restrito em [`lib/cors-allowlist.ts`](../lib/cors-allowlist.ts) para `/api/boards`; portal com allowlist de colunas/cards; snapshot do Copilot só do board autorizado.
- **Risco residual:** Dados em prompts de terceiros (provedores LLM) — política de retenção e opt-in documentados.

### Denial of service

- **Ameaça:** Abuso de rotas públicas ou LLM (custo).
- **Controles:** [`lib/rate-limit.ts`](../lib/rate-limit.ts), [`lib/global-api-rate-limit.ts`](../lib/global-api-rate-limit.ts), caps diários por org ([`lib/ai-org-budget.ts`](../lib/ai-org-budget.ts)); rate limit também em `GET /api/portal/[token]`, `GET /api/organizations/branding-public` e POSTs de integrações Slack/Teams (env `FLUX_RL_*` configuráveis).
- **Risco residual:** Ataques distribuídos — escalar com WAF/Vercel conforme necessidade.

### Elevation of privilege

- **Ameaça:** Usuário comum obtém `isAdmin` ou acesso cross-org.
- **Controles:** Claims JWT emitidos só no servidor; gates em `plan-gates`; org admin explícito.
- **Risco residual:** Lógica incorreta em nova rota — revisão de `orgId` obrigatória.

## Rotas críticas (amostra)

| Rota / área | Autenticação | Notas |
|-------------|--------------|--------|
| `PUT /api/boards/[id]` | JWT + membership | Estado principal do Kanban |
| `GET/POST /api/boards` | JWT | Lista/criação; CORS allowlist |
| `POST /api/billing/webhook` | Stripe signature | Não usar JWT |
| `GET /api/cron/*` | `x-cron-secret` | Em produção exige segredo dedicado ([`lib/cron-secret.ts`](../lib/cron-secret.ts)) |
| `GET/POST /api/portal/[token]` | Token de URL | Rate limit; escopo mínimo |
| `POST /api/boards/[id]/copilot` | JWT + plano | Custo LLM + orçamento org |

## Decisões recentes de hardening (março/2026)

- Rotas internas de segurança deixaram de reutilizar `JWT_SECRET` como fallback de autenticação.
- `resolve-host` e `rate-limit-check` agora exigem segredos dedicados (`INTERNAL_HOST_RESOLVE_SECRET` e `RATE_LIMIT_INTERNAL_SECRET`).
- CORS wildcard legado em `/api/boards` foi limitado a ambientes não produtivos.
- Webhooks outbound: bloqueio de URLs com credenciais embutidas, IPs privados/reservados (literal e pós-DNS), hostnames de metadata conhecidos; falha imediata na entrega sem ciclo longo de retries quando a URL é rejeitada.

## Referências internas

- Runbook: [`flux-security-runbook.md`](./flux-security-runbook.md)
- ASVS reduzido: [`flux-security-asvs-checklist.md`](./flux-security-asvs-checklist.md)
- Execução do plano de pentest (inventário, achados estáticos, E2E): [`pentest-execution-report.md`](./pentest-execution-report.md)
