# Backlog Reborn — Plataforma Kanban (Next.js)

Aplicação de gestão de backlog em formato Kanban, migrada para **React + Next.js 15** com App Router para melhor performance e experiência de desenvolvimento.

## Estrutura do Projeto

```
seguradora-reborn/
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
│   ├── kv-boards.ts         # CRUD boards (Vercel KV)
│   └── kv-users.ts          # CRUD usuários (Vercel KV)
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
- **Vercel KV** (Redis)
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

## Configuração: Vercel KV

O sistema usa **Vercel KV (Redis)** para persistir dados.

1. Dashboard Vercel → **Storage** → **Create Database** → **KV (Redis)**
2. Conecte ao projeto `seguradora-reborn`
3. Variáveis adicionadas automaticamente: `KV_REST_API_URL`, `KV_REST_API_TOKEN`, etc.
4. Opcional: `JWT_SECRET` para produção

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
| `/users` | Administração de usuários (admin) |
| `/resumo-reborn.html` | Apresentação executiva |

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
