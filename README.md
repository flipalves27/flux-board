# Flux-Board — Plataforma Kanban (Next.js)

Aplicação de gestão de backlog em formato Kanban. **Organize the flow. Ship what matters.**

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
├── public/
│   └── resumo-reborn.html   # Apresentação executiva (estática)
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

Para deploy na Vercel: `vercel` ou push para o repositório conectado.

## Configuração: MongoDB (Vercel)

Usuários, boards e metadados ficam no **MongoDB**.

1. Dashboard Vercel → **Storage** → crie ou vincule um banco **MongoDB** ao projeto.
2. Garanta a variável **`MONGODB_URI`** no ambiente do projeto (a integração costuma injetá-la automaticamente).
3. Opcional: **`MONGO_URI`** — alias aceito pelo código.
4. Opcional: **`MONGODB_DB`** — nome do database se quiser forçar (senão usa o database da connection string).
5. Opcional: **`JWT_SECRET`** em produção.

**Desenvolvimento local:** sem `MONGODB_URI`, a API usa armazenamento **em memória** (dados somem ao reiniciar o servidor).

**Coleções criadas automaticamente:** `users`, `boards`, `user_boards`, `counters` (índices em `emailLower` / `usernameLower` na primeira execução).

**Migração:** dados antigos no Redis/KV não são migrados automaticamente; é preciso exportar/importar manualmente se necessário.

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
| `/negocios` | Hub de oportunidades comerciais (produto) |
| `/users` | Administração de usuários (admin) |
| `/resumo-reborn.html` | Apresentação executiva |

### API comercial / go-to-market

| Endpoint | Descrição |
|----------|-----------|
| `GET /api/executive-brief` | Brief executivo em Markdown (JWT) |
| `GET /api/portfolio-export` | JSON `flux-board.portfolio.v1` para BI / integrações (JWT) |
| `PUT /api/boards/[id]/forms` | Configura Flux Forms no board (JWT) |
| `POST /api/forms/[slug]` | Intake público: cria card automaticamente no board |

**Freemium (opcional):** defina `FLUX_MAX_BOARDS_PER_USER` (inteiro ≥ 1) para limitar boards por usuário não-admin. `FLUX_PRO_TENANT=true` (ou `1`) remove o teto. Também é aceito o prefixo público `NEXT_PUBLIC_FLUX_MAX_BOARDS_PER_USER` para o mesmo limite (útil em builds client-side).

**Quota calls/dia (opcional, Free):** defina `FLUX_FREE_CALLS_PER_DAY` (inteiro ≥ 1). Padrão: `3`. Quando exceder, o backend bloqueia chamadas que disparam IA (card context/daily insights) até o próximo dia.

**Campo comercial por board:** `clientLabel` — texto curto (ex.: cliente, conta). Edição no cabeçalho do board; incluído no brief e no export JSON.

## Credenciais padrão

- **Admin:** usuário `Admin`, senha `Admin` (case sensitive)

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

