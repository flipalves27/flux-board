# Checklist OWASP ASVS (reduzido) — Flux-Board

Nível alvo conceitual: **V2 padrão** para aplicação SaaS B2B com dados de trabalho (não dados médicos/financeiros pesados no core). Itens marcados na implementação atual (março/2026).

Legenda: **Feito** | **Parcial** | **Falta**

## V1 — Arquitetura

| ID | Item | Status |
|----|------|--------|
| 1.1 | Documentação de superfícies e ameaças | **Feito** — `flux-security-threat-model.md` |
| 1.2 | Separação de ambientes (dev/prod) | **Parcial** — via env; responsabilidade deploy |

## V2 — Autenticação

| ID | Item | Status |
|----|------|--------|
| 2.1 | Senhas com algoritmo adaptativo (scrypt) | **Feito** — `lib/auth.ts` |
| 2.2 | Sessão com expiração e refresh rotativo | **Feito** — cookies + `kv-refresh-sessions` |
| 2.3 | Proteção brute-force em login | **Parcial** — rate limits globais; reforçar por IP se necessário |

## V3 — Gestão de sessão

| ID | Item | Status |
|----|------|--------|
| 3.1 | Cookies httpOnly / Secure em prod | **Feito** — `session-cookies.ts` |
| 3.2 | SameSite em cookies de sessão | **Feito** — `lax` |
| 3.3 | Invalidação de sessão no logout | **Feito** — `api/auth/logout` |

## V4 — Controle de acesso

| ID | Item | Status |
|----|------|--------|
| 4.1 | Autorização por recurso (board/org) | **Feito** — `userCanAccessBoard`, `orgId` nas queries |
| 4.2 | Impedir IDOR em APIs | **Feito** — padrão nas rotas de board; revisar novas rotas |
| 4.3 | Gates por plano comercial | **Feito** — `plan-gates.ts` |

## V5 — Validação e sanitização

| ID | Item | Status |
|----|------|--------|
| 5.1 | Validação de entrada (Zod) | **Feito** — `schemas.ts` |
| 5.2 | Sanitização de texto/HTML | **Feito** — `sanitizeText` / `sanitizeDeep` em PUT board |
| 5.3 | URLs seguras em links | **Feito** — `isSafeLinkUrl` |

## V7 — Criptografia em repouso / trânsito

| ID | Item | Status |
|----|------|--------|
| 7.1 | TLS em produção (HSTS) | **Feito** — `middleware.ts` |
| 7.2 | Segredos só em env | **Feito** — `env-validate`, `jwt-secret` |

## V8 — Proteção de dados

| ID | Item | Status |
|----|------|--------|
| 8.1 | Minimização em portal/embed | **Parcial** — configurável por allowlist |
| 8.2 | Retenção Copilot / IA | **Feito** — TTL configurável + limite de mensagens (`kv-board-copilot`) |

## V9 — Comunicação

| ID | Item | Status |
|----|------|--------|
| 9.1 | Headers de segurança (CSP, XFO) | **Feito** — `middleware.ts` |
| 9.2 | CORS restrito em APIs sensíveis | **Feito** — allowlist para `/api/boards` |

## V10 — APIs maliciosas / abuso

| ID | Item | Status |
|----|------|--------|
| 10.1 | Rate limiting | **Feito** — `rate-limit`, `global-api-rate-limit` |
| 10.2 | Orçamento LLM por org | **Feito** — `ai-org-budget.ts` + log de uso |

## V11 — Lógica de negócio

| ID | Item | Status |
|----|------|--------|
| 11.1 | Webhooks assinados (outbound) | **Feito** — HMAC SHA-256 |
| 11.2 | Webhook Stripe verificado | **Feito** — assinatura Stripe |

## V14 — Configuração

| ID | Item | Status |
|----|------|--------|
| 14.1 | Validação de env na subida | **Feito** — `env-validate.ts` |
| 14.2 | Crons exigem segredo em produção | **Feito** — `cron-secret.ts` |
| 14.3 | Segredos internos dedicados (sem fallback JWT) | **Feito** — `internal/*` |

---

## Checklist rápido para PR de API (obrigatório)

- Confirmar autenticação (`getAuthFromRequest`) quando a rota não for pública por design.
- Confirmar autorização por recurso (`orgId`, `boardId`, papel/admin), com retorno `403` quando negar acesso.
- Revisar validação/sanitização de entrada (Zod + `sanitize*` quando aplicável).
- Garantir que segredos internos usem env dedicado e nunca fallback para `JWT_SECRET`.
- Registrar cobertura mínima de testes para `401` e, quando aplicável, `403`.

---

Revisar este checklist a cada release maior ou após incidente.

---

**Execução do plano OWASP (automatizado + estático):** 2026-03-29 — `npm run security:audit` (0 vulnerabilidades prod), `npm run pentest:inventory` (150 rotas, 0× `review_manually`). Itens **Parcial** (1.2, 2.3, 8.1) mantêm-se até validação em staging com dois inquilinos e DAST; detalhe em [pentest-execution-report.md](./pentest-execution-report.md).
