# Flux-Board — Plataforma Kanban (Next.js)

Aplicação de gestão de backlog em formato Kanban. **Organize the flow. Ship what matters.**

Posicionamento (ICP, moat de fluxo, intake, inteligência operacional e escopo de integrações): [`docs/strategy/posicionamento-icp-e-moat.md`](docs/strategy/posicionamento-icp-e-moat.md).

## Estrutura do Projeto

```
flux-board/
├── app/
│   ├── api/                 # Route Handlers (auth, boards, users)
│   ├── board/[id]/          # Página do Kanban
│   ├── boards/              # Lista de boards
│   ├── login/               # Login e cadastro
│   ├── users/               # Administração de usuários (admin)
│   ├── layout.tsx
│   └── page.tsx             # Redirect para login ou boards
├── components/
│   ├── kanban/              # KanbanBoard, KanbanColumn, KanbanCard, modais
│   └── header.tsx
├── context/
│   └── auth-context.tsx     # Autenticação JWT
├── lib/
│   ├── api-client.ts        # Cliente API com suporte a Vercel bypass
│   ├── auth.ts              # JWT, hash de senha
│   ├── mongo.ts             # Cliente MongoDB (serverless / Vercel)
│   ├── kv-boards.ts         # CRUD boards (MongoDB)
│   └── kv-users.ts          # CRUD usuários (MongoDB)
├── data/
│   └── db.json              # Seed inicial
├── public/                  # Assets estáticos (favicon, etc.)
├── scripts/
│   ├── migrate-legacy-board-ids.mjs  # Migração legado b_reborn_* → b_default_* (MongoDB)
│   └── migrate-reborn-board-ids.mjs  # Delega para migrate-legacy-board-ids.mjs (compat)
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── vercel.json
```

## Tecnologias

- **Next.js 15** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS**
- **@dnd-kit** (drag-and-drop)
- **MongoDB** (driver oficial, ex.: Vercel Storage / Atlas)
- **JWT** (autenticação)

## Desenvolvimento

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Build e Deploy

```bash
npm run build
npm start
```

**Antes de subir para produção**, rode o checklist completo (lint + testes + build):

```bash
npm run validate:deploy
```

Para deploy na Vercel: `vercel` ou push para o repositório conectado.

### Colaboração em tempo real e Redis (opcional)

- **`REDIS_URL`**: URL TCP (`redis://` ou `rediss://`), por exemplo Upstash. Pub/Sub entre instâncias Node exige cliente TCP; a API REST do Upstash não oferece `SUBSCRIBE`. Detalhes e limitações estão comentados em [`.env.example`](.env.example).
- **Serverless**: se não existir um processo Node de longa duração com o subscritor Redis ativo (por exemplo em certos modelos de deploy), o fan-out entre instâncias pode não funcionar; o cliente mantém SSE na instância que serve a ligação e usa **polling** de reserva pelo `lastUpdated` do board.
- **Sem `REDIS_URL`**: o hub SSE fica **apenas em memória** no processo atual (adequado a desenvolvimento ou deploy de instância única).

### Diagnóstico em produção (erros / React #185)

- Documentação: [`docs/flux-diagnostics.md`](docs/flux-diagnostics.md)
- Ativar painel: adicione `?fluxDebug=1` à URL ou `localStorage.setItem("fluxDiag","1")`.
- No console do navegador: `window.__FLUX_DIAG__.dump()` para exportar o buffer de eventos.

## BPMN Visual Design System

- Guia mestre: [`docs/bpmn-design-system-guide.md`](docs/bpmn-design-system-guide.md)
- Tokens visuais: [`docs/bpmn-visual-tokens.json`](docs/bpmn-visual-tokens.json)
- Matriz semântica: [`docs/bpmn-semantic-mapping.md`](docs/bpmn-semantic-mapping.md)
- Biblioteca de ícones: [`docs/bpmn-icon-library.md`](docs/bpmn-icon-library.md)
- Relatório de validação v1.1: [`docs/bpmn-validation-report-v1.1.md`](docs/bpmn-validation-report-v1.1.md)

## Configuração: MongoDB (Vercel)

Usuários, boards e metadados ficam no **MongoDB**.

1. Dashboard Vercel → **Storage** → crie ou vincule um banco **MongoDB** ao projeto.
2. Garanta a variável **`MONGODB_URI`** no ambiente do projeto (a integração costuma injetá-la automaticamente).
3. Opcional: **`MONGO_URI`** — alias aceito pelo código.
4. Opcional: **`MONGODB_DB`** — nome do database se quiser forçar (senão usa o database da connection string).
5. Opcional: **`JWT_SECRET`** em produção.

### Login social (Google e Microsoft)

OAuth 2.0 + OIDC via rotas `/api/auth/oauth/google/*` e `/api/auth/oauth/microsoft/*`; a sessão continua sendo JWT + cookies httpOnly como no login por senha.

**Secrets (servidor):**

- `AUTH_GOOGLE_CLIENT_ID` / `AUTH_GOOGLE_CLIENT_SECRET`
- `AUTH_MICROSOFT_CLIENT_ID` / `AUTH_MICROSOFT_CLIENT_SECRET`
- `AUTH_MICROSOFT_TENANT_ID` (opcional; padrão `common` para contas pessoais e escolares)

**Base URL:** defina `NEXT_PUBLIC_APP_URL` com o host canónico preferido (ex.: `https://www.flux-board.com`). O servidor alinha o `redirect_uri` ao host do pedido quando este difere da variável (www vs apex); registe **todos** os hosts reais nos provedores.

**Produção — allowlist de origins:** `OAUTH_ALLOWED_PUBLIC_ORIGINS` deve listar exatamente os **Authorized JavaScript origins** (HTTPS) que usa em Google/Azure, por exemplo `https://www.flux-board.com,https://flux-board.com`. Com OAuth ativo em produção, a variável é obrigatória; hosts fora da lista recebem JSON `{"error":"oauth_host_not_allowed"}` (403) no start/callback em vez de um `redirect_uri` rejeitado pelo provedor.

**Redirect URIs registrados nos provedores (por cada host da allowlist):**

- `https://<host>/api/auth/oauth/google/callback`
- `https://<host>/api/auth/oauth/microsoft/callback`

**Opcional — um só host para HTML:** em produção, `SITE_CANONICAL_ORIGIN` + `SITE_HOST_ALIASES` (CSV de hostnames) aplicam redirecionamento 308 de pedidos documento/HTML dos aliases para o origin canónico (ver `.env.example`). Não substitui a allowlist OAuth.

**Exibir botões na tela de login (cliente):**

- `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` = `1` ou `true`
- `NEXT_PUBLIC_OAUTH_MICROSOFT_ENABLED` = `1` ou `true`

**Diagnóstico (opcional):** `FLUX_AUTH_DEBUG=1` no servidor emite logs com prefixo `[flux-auth-debug]` (JSON numa linha) para investigar perda de sessão após login social, por exemplo *www* vs *apex* e cookies. Ver [`.env.example`](.env.example).

**Runbook (repro, DevTools, Network, logs Vercel, env, Google Console):** [`docs/oauth-session-diagnostics.md`](docs/oauth-session-diagnostics.md).

**Desenvolvimento local:** sem `MONGODB_URI`, a API usa armazenamento **em memória** (dados somem ao reiniciar o servidor).

**Coleções criadas automaticamente:** `users`, `boards`, `user_boards`, `counters` (índices em `emailLower` / `usernameLower` na primeira execução).

**Migração:** dados antigos no Redis/KV não são migrados automaticamente; é preciso exportar/importar manualmente se necessário.

**Boards legados `b_reborn_<orgId>`:** antes de publicar versões sem esse ID, rode `npm run migrate:legacy-board-ids` (ou `npm run migrate:reborn-boards`, alias) com `MONGODB_URI` definido (renomeia para `b_default_<orgId>` e atualiza referências). Ordem: migração → deploy.

## Configuração: Billing / Stripe (Vercel)

Checkout, portal de cobrança, faturas e webhook usam o SDK Stripe no servidor. Lista canônica de variáveis: [`.env.example`](.env.example).

**Fluxo no app:** rota dedicada `/{locale}/billing/checkout` redireciona para o Checkout hospedado da Stripe; após pagamento ou cancelamento, o usuário volta para `/{locale}/billing/checkout/return?result=success|cancel` (padrão quando `STRIPE_CHECKOUT_*_URL` não está definido). Query útil: `?plan=pro|business&interval=month|year&seats=N` inicia o redirect automaticamente após carregar.

### Variáveis na Vercel

No [Vercel Dashboard](https://vercel.com/dashboard) → projeto → **Settings** → **Environment Variables**, defina (como **Encrypted** onde aplicável):

| Variável | Descrição |
|----------|-----------|
| `STRIPE_SECRET_KEY` | Chave secreta (`sk_live_...` ou `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Segredo de assinatura do endpoint (`whsec_...`) |
| `STRIPE_PRICE_ID_PRO` | ID do preço mensal Pro (`price_...`) |
| `STRIPE_PRICE_ID_BUSINESS` | ID do preço mensal Business |
| `STRIPE_PRICE_ID_PRO_ANNUAL` | Opcional — plano anual Pro |
| `STRIPE_PRICE_ID_BUSINESS_ANNUAL` | Opcional — plano anual Business |
| `STRIPE_PRODUCT_ID_PRO` / `STRIPE_PRODUCT_ID_BUSINESS` | Opcionais — admin “Publicar no Stripe” |
| `STRIPE_CHECKOUT_SUCCESS_URL` / `STRIPE_CHECKOUT_CANCEL_URL` | Opcionais — sobrescrevem o retorno padrão (`/billing/checkout/return`) |
| `STRIPE_PORTAL_RETURN_URL` | Opcional — retorno do Billing Portal |
| `NEXT_PUBLIC_APP_URL` | Recomendado — domínio canônico (redirects e URLs derivadas) |

Use pares consistentes: em **Production**, chaves e Price IDs **live**; em **Preview** ou local, **test** (`sk_test_`, preços de teste). Não misture secret live com IDs de teste.

### Webhook no Stripe

1. [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks** → **Add endpoint**.
2. **URL:** `https://<seu-dominio>/api/billing/webhook` (domínio estável de produção ou staging; previews com URL mutável costumam usar só produção ou Stripe CLI em local).
3. **Eventos** tratados pela aplicação: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` e `checkout.session.completed` (modo subscription; redundância para ativar plano). Ver `handleStripeWebhook` em [`lib/billing.ts`](lib/billing.ts).
4. Copie o **Signing secret** para `STRIPE_WEBHOOK_SECRET` na Vercel e faça um novo deploy se necessário.

### Validação após deploy (smoke test)

1. Logs de arranque: ausência de `STRIPE_SECRET_KEY` em produção gera aviso em [`lib/env-validate.ts`](lib/env-validate.ts).
2. Fluxo: abrir **Billing**, iniciar checkout de teste (modo teste), concluir ou cancelar e confirmar redirects.
3. Após assinatura de teste: conferir no MongoDB na organização `stripeCustomerId`, `stripeSubscriptionId` e `stripeStatus`.
4. Webhook: no Stripe, “Send test webhook” para os eventos acima ou repetir checkout e verificar atualização da org.

## Deployment Protection na Vercel

A aplicação suporta **Protection Bypass for Automation**, permitindo que login e API funcionem mesmo com Deployment Protection ativa (Standard, Vercel Authentication, etc.), sem precisar definir Protection para "None".

### Configuração do Bypass (recomendado)

1. Acesse o [Vercel Dashboard](https://vercel.com/dashboard) → seu projeto
2. Vá em **Settings** → **Deployment Protection**
3. Em **Protection Bypass for Automation**, clique em **Create** para gerar um secret
4. Em **Settings** → **Environment Variables**, adicione:
   - Nome: `NEXT_PUBLIC_VERCEL_BYPASS_SECRET`
   - Valor: o mesmo secret gerado no passo 3
   - Ambiente: Production (e Preview, se desejar)
5. Faça um **novo deploy**

Com isso, todas as requisições da aplicação incluem o header de bypass automaticamente.

### Alternativa: Protection None

Se preferir não usar o bypass, defina **Protection** para **None** em Deployment Protection. A aplicação já usa autenticação própria (JWT).

## Rotas

| Rota | Descrição |
|------|-----------|
| `/` | Redirect para login ou boards |
| `/login` | Login e cadastro |
| `/boards` | Lista de boards |
| `/board/[id]` | Kanban do board |
| `/forms/[slug]` | Formulário público para intake de demandas |
| `/users` | Diretório de utilizadores (gestores da org) |

### API comercial / go-to-market

| Endpoint | Descrição |
|----------|-----------|
| `GET /api/executive-brief` | Brief executivo em Markdown (JWT) |
| `GET /api/portfolio-export` | JSON `flux-board.portfolio.v1` para BI / integrações (JWT) |
| `PUT /api/boards/[id]/forms` | Configura Flux Forms no board (JWT) |
| `POST /api/forms/[slug]` | Intake público: cria card automaticamente no board |

### Public API v1 (beta)

- OpenAPI: `GET /api/public/v1/openapi`
- Boards: `GET /api/public/v1/boards`
- Cards: `GET /api/public/v1/cards`
- Sprints: `GET /api/public/v1/sprints`
- Comments: `GET /api/public/v1/comments`
- Token lifecycle (platform admin):
  - `GET/POST /api/admin/public-api-tokens`
  - `POST/DELETE /api/admin/public-api-tokens/{id}`
- Rate-limit (v1):
  - `PUBLIC_API_V1_RATE_LIMIT_WINDOW_MS`
  - `PUBLIC_API_V1_RATE_LIMIT_READ`
  - `PUBLIC_API_V1_RATE_LIMIT_WRITE`
- Guia rápido: [`docs/public-api-v1.md`](docs/public-api-v1.md)

### Git integrations v1 (scaffold)

- Org connection routes:
  - `GET/POST /api/integrations/github`
  - `GET/POST /api/integrations/gitlab`
- Inbound webhooks:
  - `POST /api/integrations/github/webhook`
  - `POST /api/integrations/gitlab/webhook`
- Includes replay-protection by delivery id.
- Guia técnico: [`docs/integrations-git-v1.md`](docs/integrations-git-v1.md)

### Push notifications v1 (scaffold)

- API de subscriptions:
  - `GET/POST/DELETE /api/users/me/push-subscriptions`
- API de enqueue/disparo:
  - `POST /api/push/notify`
  - `GET /api/cron/push-dispatch`
- UI de ativação em `Org Settings`
- Guia técnico: [`docs/push-notifications-v1.md`](docs/push-notifications-v1.md)

### Governança e quality gates

- Gate técnico geral: `npm run quality:gates:report` → `docs/reports/quality-gate-latest.md`
- Gate UI/performance/a11y: `npm run quality:gates:ui` → `docs/reports/ui-quality-gate-latest.md`
- Dashboard semanal de métricas: `npm run governance:weekly` → `docs/reports/governance-weekly-latest.md`
- Fechamento consolidado das ondas: [`docs/reports/waves-closure-summary.md`](docs/reports/waves-closure-summary.md)
  - Acesso operacional no produto: **somente Admin da plataforma**.

### Automation Builder v1 (scaffold)

- Regras por board:
  - `GET/PUT /api/boards/[id]/automations`
- Logs de execução:
  - `GET/POST /api/boards/[id]/automations/logs`
- Guia técnico: [`docs/automation-builder-v1.md`](docs/automation-builder-v1.md)

**Freemium (opcional):** defina `FLUX_MAX_BOARDS_PER_USER` (inteiro ≥ 1) para limitar boards por usuário não-admin. `FLUX_PRO_TENANT=true` (ou `1`) remove o teto. Estes valores são **só servidor** (sem `NEXT_PUBLIC_*`); limites aplicam-se nas APIs.

**Quota calls/dia (opcional, Free):** defina `FLUX_FREE_CALLS_PER_DAY` (inteiro ≥ 1). Padrão: `3`. Quando exceder, o backend bloqueia chamadas que disparam IA (card context/daily insights) até o próximo dia. Também só servidor.

**Flux Docs / RAG (só servidor):** `FLUX_DOCS_ENABLED`, `FLUX_DOCS_RAG_ENABLED` (default ligado se omitidos).

**Campo comercial por board:** `clientLabel` — texto curto (ex.: cliente, conta). Edição no cabeçalho do board; incluído no brief e no export JSON.

## Credenciais padrão

- **Admin:** usuário `Admin`, senha `Admin` (case sensitive)

## Papéis (RBAC)

- **Administrador do domínio** (`platform_admin`): acesso a todas as organizações e às operações globais da plataforma (ex.: `/rate-limit-abuse`). A conta seed `Admin` usa este papel.
- **Gestor** (`gestor` na organização): gere apenas a sua organização — billing, convites, utilizadores, Equipe e definições. Corresponde ao antigo “admin da org” e ao papel executivo para efeitos de permissão.
- **Membro** (`membro`) e **Convidado** (`convidado`): sem gestão da org; convidados não podem criar boards na organização.

## Funcionalidades

- Login/cadastro com JWT (localStorage ou sessionStorage)
- CRUD de boards
- Kanban com drag-and-drop entre colunas
- Filtros por prioridade, rótulos e busca
- Mapa de Produção (editável)
- Import/export CSV (UTF-8 BOM, `;` separador)
- Direcionamento (Manter, Priorizar, Adiar, Cancelar, Reavaliar)
- Sincronização debounced (300ms) com API
- Brief executivo (.md) e export JSON do portfólio na lista de boards
- Rótulo comercial por board (`clientLabel`) e página **Negócios** com linhas de receita
- Flux Forms: formulário público com classificação automática (prioridade/tags/coluna) e criação de card

## Weekly Digest IA (por email)

Gera um resumo semanal por board e envia para os gestores de cada organização, pela regra: `org.ownerId` (dono/criador da org), via `Vercel Cron`.

### Endpoint

- `GET /api/weekly-digest`

### Variáveis de ambiente

- `WEEKLY_DIGEST_SECRET` (opcional, recomendado): secret validado via header `x-cron-secret` para evitar chamadas públicas
- `RESEND_API_KEY`: API key do Resend
- `RESEND_FROM_EMAIL`: endereço remetente do email
- `NEXT_PUBLIC_APP_URL` (opcional): base URL para links no email (senão usa `#`)
- `DIGEST_TIMEZONE` (opcional, padrão `America/Sao_Paulo`): timezone usado para rotular a semana
- `DIGEST_RECIPIENT_OVERRIDE_EMAILS` (opcional): lista de emails (CSV) para substituir os destinatários (útil em testes)
- `WEEKLY_DIGEST_AI_MAX_BOARDS_PER_ORG` (opcional, padrão `10`): limite de boards para tentar IA por org
- `TOGETHER_API_KEY` e `TOGETHER_MODEL`: habilitam geração do insight via IA, classificação de submissões do Flux Forms e outros fluxos (fallback heurístico quando a IA não está disponível ou falha)

### Agendamento (Vercel Cron)

Configure uma regra para disparar na **segunda-feira às 08:00** chamando:

- URL: `https://SEU_DOMINIO/api/weekly-digest`
- Header: `x-cron-secret: WEEKLY_DIGEST_SECRET`

## Proactive AI (checagem diária de anomalias)

Job diário que calcula z-scores (throughput, WIP, lead time) e regras diagnósticas (OKR drift, estagnação, vencimentos). Resultados aparecem em **Relatórios** (Flux Reports) e alertas recentes entram no **Weekly Digest** (bloco opcional).

### Endpoint

- `GET` ou `POST /api/cron/anomaly-check`

### Variáveis de ambiente

- `ANOMALY_CRON_SECRET` (opcional): se definido, exige `x-cron-secret` igual a este valor; senão usa `WEEKLY_DIGEST_SECRET` ou `AUTOMATION_CRON_SECRET` (mesmo padrão dos outros crons)
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL`: envio imediato de e-mail em alertas **warning** ou **critical** (mesmo remetente do digest/automações)
- `NEXT_PUBLIC_APP_URL`: links “Abrir board” no e-mail e deep links
- `TOGETHER_API_KEY` / `TOGETHER_MODEL`: texto da **ação sugerida** (fallback heurístico se ausente)
- `ANOMALY_NOTIFY_OVERRIDE_EMAILS` (opcional): força destinatários de e-mail (CSV) — útil em staging
- `ANOMALY_ORG_NOTIFY_EMAILS` (opcional): destinatários para alertas **sem** `boardId` (throughput org, lead time, etc.); se vazio, usa admins da org
- Requer MongoDB; histórico diário fica nas coleções `anomaly_daily_snapshots`, `anomaly_check_runs`, `anomaly_alerts`, `anomaly_notify_dedupe` (histerese 48h para não reenviar a mesma anomalia)

Por board, em **Alertas** no header do board: tipos, severidade mínima, e-mails extras e desligar e-mail.

O repositório inclui entradas em `vercel.json`: `/api/cron/anomaly-check` em `0 10 * * *` UTC e `/api/cron/automations` em `0 8 * * *` UTC. No plano **Hobby**, o Vercel falha o deploy se algum cron rodar mais de uma vez por dia; para automações mais frequentes é preciso **Pro** ou um agendador externo.

