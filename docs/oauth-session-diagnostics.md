# Diagnóstico: login Google OAuth e sessão

Runbook alinhado ao código atual (`lib/oauth/*`, `lib/server-session.ts`, `context/auth-context.tsx`). Use em conjunto com os logs da Vercel (Functions).

## 1. Reprodução no host canónico

1. Escolha **um** host oficial (recomendado: o mesmo valor de `NEXT_PUBLIC_APP_URL`, por exemplo `https://www.flux-board.com`).
2. Em DevTools → **Application** → **Storage** → **Clear site data** para esse origin (ou apague só os cookies do site).
3. Abra só esse URL, faça **Sign in** → **Google** até voltar à app.
4. **Anotar:** fica autenticado nas boards ou é redirecionado de volta ao login?

**Nota:** Se misturar `www`, apex (`flux-board.com`) e `*.vercel.app`, o `redirect_uri` e os cookies podem divergir. O servidor usa o host do pedido quando difere de `NEXT_PUBLIC_APP_URL` para montar o OAuth (`getOAuthPublicBaseUrl` em `lib/oauth/base-url.ts`). Em **produção**, `OAUTH_ALLOWED_PUBLIC_ORIGINS` deve espelhar todos esses origins no Google/Azure; caso contrário o start/callback responde 403 `oauth_host_not_allowed` ou 503 `oauth_allowlist_misconfigured` (ver `lib/oauth/allowed-public-origins.ts`).

## 2. Cookies após o callback Google (Application)

Imediatamente após o redirect do Google (antes de navegar à vontade), em **Application** → **Cookies**:

| Nome | Função |
|------|--------|
| `flux_access` | JWT de acesso (httpOnly) |
| `flux_refresh` | Refresh opaco (httpOnly) |
| `flux_oauth_google` | Só durante o fluxo; deve ser limpo no callback |

**Atributos esperados em produção** (ver `lib/session-cookies.ts`):

- **Path:** `/`
- **HttpOnly:** sim (valores não aparecem ao JavaScript da página)
- **Secure:** sim quando `NODE_ENV === "production"`
- **SameSite:** `Lax`
- **Domain:** se `AUTH_COOKIE_DOMAIN` estiver definido (ex.: `flux-board.com`), o cookie vale para esse domínio e subdomínios; sem a variável, cookies são *host-only* (adequado a localhost)

Se `flux_access` / `flux_refresh` **não** aparecem, o problema está na resposta do callback ou na política do browser; se aparecem mas a sessão falha a seguir, avançar para secções 3–4.

## 3. Rede na carga inicial de `/…/boards` (Server Action)

O estado de auth vem de `GET /api/auth/session` (`fetchSessionValidate` em `lib/api-client.ts`), chamado no mount do `AuthProvider` (`context/auth-context.tsx`), com retries `[400, 500, 900, 1600, 2400]` ms após `ok: false` ou timeout (evita Server Action a competir com o POST de RSC na primeira carga).

1. Abra **Network**, recarregue a página dos boards.
2. Confirme um **GET** a `/api/auth/session` (mesmo origin) com header **`Cookie`** contendo `flux_access` / `flux_refresh` e resposta **200** JSON com `"ok":true` quando a sessão é válida.
3. (Opcional) POST de Server Action ao pathname da página — hoje a validação inicial não depende disso.

Se os cookies existem em Application mas o **primeiro** POST não os envia, investigue extensões, modo restrito, ou diferença de host (ex.: apex vs www sem `AUTH_COOKIE_DOMAIN`).

## 4. Logs na Vercel (correlação)

| Prefixo / origem | Significado |
|------------------|-------------|
| `[oauth-google-callback] Cookie de start OAuth não encontrado` | Cookie `flux_oauth_google` em falta no callback (state/PKCE); ver `app/api/auth/oauth/google/callback/route.ts` |
| `[flux-session-validate]` + `"event":"fail"` | Falha em `validateSessionFromCookies`; o JSON inclui `reason` e **`supportRef`** (UUID) para cruzar com o painel “Copiar diagnóstico” no `/login` |

Na página de login, o utilizador pode **copiar um JSON** (referência + tipo de falha + URL + user-agent). Para **`no_cookies`** sem `FLUX_AUTH_DEBUG`, pode não haver linha correspondente na Vercel; **`token_invalid`**, **`user_not_found`** e **`validate_exception`** incluem sempre `supportRef` no log quando `FLUX_SESSION_VALIDATE_LOG` não está a `0`.

**Valores de `reason` em `[flux-session-validate]`** (`lib/server-session.ts`):

- `jwt_invalid_refresh_failed` — access inválido e refresh também falhou
- `jwt_invalid_no_refresh` — access inválido e sem refresh
- `refresh_failed` — sem JWT válido, só refresh, e rotação falhou
- `user_not_found` — JWT válido mas `getUserById(id, orgId)` não encontrou utilizador; cookies são limpos

Para desligar estes avisos (ex.: staging ruidoso): `FLUX_SESSION_VALIDATE_LOG=0`.

**`client_timeout` no painel de diagnóstico:** a validação de sessão (Server Action) não respondeu a tempo no browser (limite interno elevado, com novas tentativas após timeout). Costuma ser cold start + Mongo lento, não ausência de cookies.

**504 / `FUNCTION_INVOCATION_TIMEOUT` na Vercel (ex.: mensagem “Task timed out after 60 seconds” em `GET /api/auth/session`):** a função corre até ao `maxDuration` (60s nessa rota) porque alguma operação **não devolveu** — com `socketTimeoutMS` em 0 (antigo default do driver), um `findOne` / `createIndex` pendurado na rede pode esperar indefinidamente após o handshake. Em `lib/mongo.ts` define-se `socketTimeoutMS` (override: `MONGO_SOCKET_TIMEOUT_MS`) e a rota `GET /api/auth/session` aplica ainda um teto (`FLUX_SESSION_VALIDATE_WALL_MS`, default 25s) para responder **503** + JSON (`failureKind: server_timeout`) em vez de 504 sem corpo. Confirme na Atlas **Network Access** e região próxima à da Vercel.

**Diagnóstico opcional:** `FLUX_AUTH_DEBUG=1` emite `[flux-auth-debug]` com JSON (nunca tokens). Eventos úteis:

- `session_validate_no_cookies` — validação sem cookies (inclui `requestHost` quando disponível)
- `oauth_landing_host_rewritten` — `Location` reescrito para o hostname de `NEXT_PUBLIC_APP_URL` (ver `lib/oauth/session-landing-response.ts`)

Use só em Preview ou janelas curtas em Production (volume e contexto de pedido).

## 5. Checklist de variáveis (Production na Vercel)

Confirmar no dashboard (**Settings** → **Environment Variables**), sem expor valores em tickets:

| Variável | Notas |
|----------|--------|
| `JWT_SECRET` | Obrigatório; ≥ 32 caracteres; estável entre deploys (`lib/jwt-secret.ts`) |
| `AUTH_GOOGLE_CLIENT_ID` / `AUTH_GOOGLE_CLIENT_SECRET` | OAuth Google |
| `NEXT_PUBLIC_APP_URL` | URL canónica (ex.: `https://www.flux-board.com`), sem barra final desnecessária |
| `OAUTH_ALLOWED_PUBLIC_ORIGINS` | Produção com OAuth ativo: CSV ou JSON array de origins HTTPS (igual às **JavaScript origins** no Google; incluir `www` e apex se ambos forem usados) |
| `AUTH_COOKIE_DOMAIN` | Ex.: `flux-board.com` (sem `https://`, sem path); alinha www e apex |
| `SITE_CANONICAL_ORIGIN` / `SITE_HOST_ALIASES` | Opcional — redirecionamento 308 HTML de aliases para o host canónico (`middleware.ts`) |
| `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` | `1` ou `true` para mostrar o botão |
| `NEXT_PUBLIC_VERCEL_BYPASS_SECRET` | Se usar **Deployment Protection** com bypass; ver secção no `README.md` |
| `MONGODB_URI` (ou `MONGO_URI`) | Dados de utilizador / refresh |

Se a Protection estiver ativa sem bypass configurado, fluxos que dependem de POST (incl. Server Actions) podem falhar.

## 6. Google Cloud Console — origens e redirect URIs

Para **cada host** por onde utilizadores autenticam (ex.: `www`, apex, previews `*.vercel.app`):

**Authorized JavaScript origins**

- `https://<host>`  
  (sem path; porta só se não for 443)

**Authorized redirect URIs**

- `https://<host>/api/auth/oauth/google/callback`

**Espelho na Vercel (produção):** copie a mesma lista de origins para `OAUTH_ALLOWED_PUBLIC_ORIGINS` (ex.: `https://www.flux-board.com,https://flux-board.com`).

| Ambiente | JavaScript origins (exemplo) | Redirect URIs (exemplo) |
|----------|------------------------------|-------------------------|
| Produção `www` | `https://www.flux-board.com` | `https://www.flux-board.com/api/auth/oauth/google/callback` |
| Produção apex | `https://flux-board.com` | `https://flux-board.com/api/auth/oauth/google/callback` |
| Preview | `https://<deployment>.vercel.app` | `https://<deployment>.vercel.app/api/auth/oauth/google/callback` |

O código monta o redirect com `googleRedirectUri(base)` → `{base}/api/auth/oauth/google/callback` (`lib/oauth/base-url.ts`). O `base` é o origin público do pedido ou `NEXT_PUBLIC_APP_URL` quando o hostname coincide.

**Microsoft (se aplicável):** mesmo padrão com `/api/auth/oauth/microsoft/callback`.

---

Após estes passos, cruze: cookies presentes + `Cookie` no POST + ausência de `fail` em `[flux-session-validate]` ⇒ sessão ok; caso contrário o `reason` e os eventos `[flux-auth-debug]` indicam o próximo ficheiro a rever.

**Plano de correções (prioridades, matriz sintoma → fix):** [`oauth-session-fix-plan.md`](oauth-session-fix-plan.md).
