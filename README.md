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
| `/negocios` | Hub de oportunidades comerciais (produto) |
| `/users` | Administração de usuários (admin) |
| `/resumo-reborn.html` | Apresentação executiva |

### API comercial / go-to-market

| Endpoint | Descrição |
|----------|-----------|
| `GET /api/executive-brief` | Brief executivo em Markdown (JWT) |
| `GET /api/portfolio-export` | JSON `flux-board.portfolio.v1` para BI / integrações (JWT) |

**Freemium (opcional):** defina `FLUX_MAX_BOARDS_PER_USER` (inteiro ≥ 1) para limitar boards por usuário não-admin. `FLUX_PRO_TENANT=true` (ou `1`) remove o teto. Também é aceito o prefixo público `NEXT_PUBLIC_FLUX_MAX_BOARDS_PER_USER` para o mesmo limite (útil em builds client-side).

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
