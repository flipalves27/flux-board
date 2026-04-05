# Plano de correções: OAuth Google e sessão

Este plano assume que o [runbook de diagnóstico](oauth-session-diagnostics.md) já foi executado (ou será executado em paralelo). **Não altere código à cega:** cada ramo abaixo corresponde a evidência concreta (cookies, Network, logs, `reason`).

---

## Fase 0 — Pré-requisitos (sem deploy de código)

| Ordem | Ação | Quando aplicar |
|-------|------|----------------|
| 0.1 | Alinhar **um** host canónico para utilizadores e `NEXT_PUBLIC_APP_URL` (ex.: `https://www.flux-board.com`). | Sempre em produção estável. |
| 0.2 | **Google Cloud Console:** para cada host real de login, adicionar **JavaScript origin** `https://<host>` e **redirect URI** `https://<host>/api/auth/oauth/google/callback`. | Erros no callback, ou login só funciona num host. |
| 0.3 | **Vercel:** confirmar `JWT_SECRET` (≥ 32 chars, estável), `AUTH_GOOGLE_*`, `MONGODB_URI`, `AUTH_COOKIE_DOMAIN` se usas www+apex, `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED`. | Qualquer falha intermitente de sessão. |
| 0.4 | **Deployment Protection:** ou `NEXT_PUBLIC_VERCEL_BYPASS_SECRET` conforme `README.md`, ou Protection = None. | POST / Server Actions falham, 401/403 em preview/production. |

**Verificação:** novo login no host canónico; cookies presentes; boards carregam sem redirect para login.

---

## Fase 1 — Matriz: evidência → correção

### A) Cookies `flux_access` / `flux_refresh` **não** aparecem após o callback

| Causa provável | Correção |
|----------------|----------|
| Redirect URI no Google não bate com o `redirect_uri` real do pedido | Fase 0.2; alinhar hosts. |
| Resposta do callback sem `Set-Cookie` (erro antes de `buildOAuthSessionLandingResponse`) | Logs da função do callback; corrigir env ou erro em `completeOAuthSignIn`. |
| Browser / extensão a bloquear cookies | Testar janela anónima ou outro browser; documentar para utilizadores. |

**Código a rever só se logs mostrarem exceção:** `app/api/auth/oauth/google/callback/route.ts`, `lib/oauth/session-landing-response.ts`, `lib/session-cookies.ts`.

---

### B) Cookies existem, mas o **primeiro** POST do Server Action **não** envia `Cookie`

| Causa provável | Correção |
|----------------|----------|
| Host da página ≠ host onde o cookie foi definido (www vs apex) sem `AUTH_COOKIE_DOMAIN` | Definir `AUTH_COOKIE_DOMAIN=flux-board.com` (ou domínio correto) na Vercel **e** garantir que apex redireciona para www **antes** do OAuth, se esse for o canónico. |
| `Location` pós-OAuth aponta para host A enquanto o cookie ficou no host B | Ver logs `oauth_landing_host_rewritten` com `FLUX_AUTH_DEBUG=1`; alinhar `NEXT_PUBLIC_APP_URL` com o host onde o utilizador permanece. **Comportamento atual:** sem `AUTH_COOKIE_DOMAIN`, o app **não** reescreve o hostname do `Location` (evita sessão perdida com cookies host-only); com `AUTH_COOKIE_DOMAIN`, continua a canonicalizar para o host de `NEXT_PUBLIC_APP_URL`. |

**Código:** `canonicalizeOAuthSessionLandingUrl` em `lib/oauth/canonicalize-oauth-landing-url.ts` (usado por `lib/oauth/session-landing-response.ts`).

**Verificação:** Network → primeiro POST com `Cookie` preenchido.

---

### C) Log `[flux-session-validate]` com `reason: user_not_found`

O JWT é válido, mas `getUserById(payload.id, payload.orgId)` não encontra utilizador.

| Causa provável | Correção |
|----------------|----------|
| Dados Mongo inconsistentes (utilizador apagado, `orgId` no token desatualizado) | Corrigir dados ou fluxo de org; investigar `lib/kv-users.ts` e última org ativa. |
| Bug em `completeOAuthSignIn` — token emitido com `orgId` que não corresponde ao documento gravado | Rever `complete-sign-in.ts` e criação de utilizador; adicionar teste de integração que valide “após OAuth, `validateSessionFromCookies` ok”. |
| Race: validação antes do utilizador estar legível na BD | Raro; se confirmado, considerar retry pontual em `validateSessionFromCookies` só para este caso (último recurso). |

**Verificação:** após login, log sem `user_not_found`; mesmo `userId`/`orgId` no token e na coleção `users`.

---

### D) `reason` JWT / refresh (`jwt_invalid_*`, `refresh_failed`)

| Causa provável | Correção |
|----------------|----------|
| `JWT_SECRET` mudou entre deploys | Estabilizar secret; utilizadores precisam voltar a autenticar (esperado). |
| Refresh revogado / KV ou Mongo de sessões inconsistente | Rever `lib/kv-refresh-sessions.ts` e TTL; logs de rotação. |
| Relógio / expiração anómala | Rever `lib/session-ttl.ts` e claims JWT. |

---

### E) `[oauth-google-callback] Cookie de start OAuth não encontrado`

| Causa provável | Correção |
|----------------|----------|
| Domínio do cookie de start ≠ domínio do callback | Alinhar `AUTH_COOKIE_DOMAIN` e hosts; não iniciar OAuth num host e receber callback noutro sem URIs + cookies partilhados. |
| Utilizador bloqueou cookies de terceiros de forma agressiva (raro para same-site) | Fase 0 + teste noutro browser. |

---

## Fase 2 — Melhorias de produto / robustez (após diagnóstico)

Executar **apenas** se a Fase 1 não bastar ou se quiseres reduzir suporte:

1. **Retries da validação inicial** — `INITIAL_SESSION_VALIDATE_RETRY_DELAYS_MS` em `context/auth-context.tsx`: alargar ligeiramente ou acrescentar 1 tentativa se métricas mostrarem corrida só no primeiro POST.
2. **Endpoint GET “session ping”** leve — alternativa ao Server Action para primeira carga (maior mudança; documentar trade-offs de segurança/cache).
3. **Logging estruturado** — mais contexto em `user_not_found` (sem PII): ex. flags `hasUserDoc`, `tokenOrgMatches` se implementável sem vazar email.

---

## Fase 3 — Ordem sugerida de execução

1. Fase 0 completa (config + Google + Vercel).  
2. Reproduzir uma vez; anotar ramo da matriz (A–E).  
3. Aplicar só as linhas da matriz correspondentes.  
4. Se necessário, Fase 2 com PR dedicado e testes.  
5. Desligar `FLUX_AUTH_DEBUG` após resolver.

---

## Ligação ao diagnóstico

- Começar sempre por [oauth-session-diagnostics.md](oauth-session-diagnostics.md) secções 1–4.  
- Este ficheiro é o mapa de **correções**; o outro é o mapa de **observação**.
