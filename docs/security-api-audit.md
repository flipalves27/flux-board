# Auditoria de superfície API (`app/api/**`)

Documento complementar ao inventário automático em [`docs/pentest-api-inventory.md`](pentest-api-inventory.md) (tags por rota). **Data:** 2026-04-05.

## Resumo executivo

| Área | Avaliação | Severidade típica |
|------|-----------|-------------------|
| Autenticação (sessão JWT/cookies) | A maioria das rotas sensíveis usa `getAuthFromRequest`; rotas públicas estão agrupadas em `public/*`, formulários por slug, branding, catálogo comercial. | Baixa quando o padrão é seguido |
| IDOR (acesso cross-org / cross-board) | Risco residual em rotas com `boardId`/`orgId` na URL se faltar `userCanAccessBoard`, `ensureOrgManager` ou `isSameOrgOrPlatformAdmin`. Revisão contínua rota a rota. | **Alta** se uma rota omitir o vínculo org/board |
| Uploads / multipart | Rotas com `formData`, PDFs, imagens (ex.: spec-plan stream, intake vision, transcribe) aumentam superfície (tamanho, parsing). Validação e limites de runtime são críticos. | Média |
| Webhooks (entrada e saída) | GitHub/GitLab/Stripe: verificação de assinatura ou segredo; org webhooks: URLs validadas (`WebhookUrlBlockedError`). | Média se validação falhar |
| Cron / internos | `verifyCronSecret` e segredos internos em rate-limit-check; não expor paths ou headers de segredo em UI (ver i18n). | Média (info disclosure) |
| Divulgação em erros JSON | **Mitigado:** `lib/public-api-error.ts` (`toPublicApiErrorBody` / `publicApiErrorResponse`) — mensagens genéricas fora de `development`, logs completos no servidor. | Era média; reduzida pós-helper |

## Autenticação e autorização

- **Padrão recomendado:** `getAuthFromRequest` → checagens em `lib/api-authz.ts` (`ensurePlatformAdmin`, `ensureOrgManager`) e `userCanAccessBoard` / `ensureSpecPlanAccess` onde há `boardId`.
- **Rotas de alto privilégio:** `app/api/admin/**`, `app/api/org/webhooks*`, operações de plataforma — documentado em comentários de `lib/api-authz.ts`.
- **API pública v1:** tokens e escopos — ver [`docs/public-api-v1.md`](public-api-v1.md).

## IDOR (foco de revisão manual)

Para cada handler que aceita `boardId` ou `orgId` (params ou body), confirmar no código:

1. Resolução da entidade com **filtro explícito** `orgId` do JWT (ou equivalente).
2. Nenhum bypass via `payload.isAdmin` de **org** para dados de **outra** org (usar `ensurePlatformAdmin` / `isSameOrgOrPlatformAdmin` quando a rota for cross-tenant administrativa).

Rotas com tag `review_manually` no inventário pentest merecem prioridade na próxima passagem.

## Uploads, SSRF e integrações

- **Multipart / ficheiros:** limitar tamanho, tipos e tempo (`maxDuration` onde aplicável); falhas de parse não devem devolver stack ou mensagens de biblioteca ao cliente (SSE spec-plan ajustado).
- **Webhooks de saída (org):** validação de URL em `lib/webhook-url.ts` (SSRF).
- **Chamadas HTTP saídas:** revisar rotas que fazem `fetch` para URLs controladas pelo utilizador.

## Achados corrigidos nesta entrega

1. Respostas JSON com `err.message` bruto substituídas pelo helper central (`publicApiErrorResponse` / mensagens públicas derivadas).
2. Variáveis `NEXT_PUBLIC_*` removidas como fallback para limites e flags só de servidor (`commercial-plan`, `plan-gates`) — ver `.env.example`.
3. Textos de UI/i18n e componentes de webhooks despoluídos de nomes de env e paths de cron para utilizadores finais (mensagens genéricas + documentação interna).

## Próximos passos (processo)

- Manter o inventário pentest atualizado (`scripts/pentest-api-inventory.mjs` quando existir).
- CI: Gitleaks (`.github/workflows/gitleaks.yml`) + política de PR sem secrets.
- Rotação de segredos se qualquer `.env*` tiver aparecido no histórico Git (ver secção em `.env.example`).

### Verificação de histórico (2026-04-05)

Comando: `git log --all --full-history -- .env.local .env` — sem entradas no clone auditado (ficheiros não seguidos pelo Git ou nunca commitados nestes paths).
