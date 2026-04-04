# Rotas e implantação — por que as melhorias não aparecem

## Causa raiz

**A aplicação implantada (Vercel/Next.js) não usa os arquivos `.html` estáticos para as URLs que o usuário acessa.**

| URL que o usuário acessa | O que é realmente servido | Arquivos .html usados? |
|--------------------------|---------------------------|-------------------------|
| `/` | `app/page.tsx` (redireciona para /boards ou /login) | Não |
| `/login` | `app/login/page.tsx` (React) | Não |
| `/boards` | `app/boards/page.tsx` (React) | Não |
| `/board/:id` (ex: `/board/b_1`) | `app/board/[id]/page.tsx` + componente `KanbanBoard` (React) | Não |
| `/board.html` | Não (arquivo removido; 404) | Não |
| `/boards.html` | Não (arquivo removido; 404) | Não |

Ou seja: o fluxo normal (login → lista de boards → abrir um board) é 100% **Next.js App Router** e **componentes React**. Nenhum `board.html` ou `boards.html` entra nesse fluxo.

## Onde estão as “duas versões” do board

- **Versão que realmente roda em produção** (quando você acessa `/board/:id`):
  - Página: `app/board/[id]/page.tsx`
  - UI do Kanban: `components/kanban/kanban-board.tsx`, `kanban-column.tsx`, `kanban-card.tsx`, `card-modal.tsx`, `mapa-modal.tsx`
  - Estilos: `app/globals.css` + classes Tailwind nos componentes
 
- **Arquivos HTML estáticos “legados” (não usados e removidos do repo)**:
  - `board.html`, `boards.html` (na raiz do projeto)
  - `public/board.html`, `public/boards.html`

Se as melhorias foram feitas nesses arquivos legados (`board.html`/`boards.html`), elas **não vão aparecer** em `/boards` nem em `/board/:id`, porque essas rotas são atendidas pelos arquivos React acima.

## Configuração atual de rotas

- **next.config.ts**: sem rewrites; não redireciona nenhuma rota para os .html.
- **vercel.json**: sem rewrites para HTML estático; crons de API conforme o arquivo.

Não existe regra que envie `/boards` ou `/board` para arquivos `.html`.

## O que fazer para as melhorias “subirem” na implantação

1. **Fazer as melhorias no código que realmente serve a rota**
   - Lista de boards: editar `app/boards/page.tsx`.
   - Board Kanban (colunas, cartões, filtros, mapa, etc.): editar `app/board/[id]/page.tsx` e os componentes em `components/kanban/` (e `app/globals.css` se for estilo global).

2. **Se a melhoria for só visual (CSS)**
   - Ajustar `app/globals.css` e/ou as classes Tailwind nos componentes em `components/kanban/` e em `app/board/[id]/page.tsx`. Não depender de estilos que existem apenas dentro de `board.html`.

3. **Arquivos .html na raiz vs em `public/`**
   - Na implantação Next.js, só o conteúdo de `public/` é servido como estático (ex.: `/board.html` = `public/board.html`).
   - Arquivos como `board.html` e `boards.html` na **raiz** do projeto **não eram servidos** em nenhuma URL; e atualmente foram removidos do repositório (mesmo para `public/`).

4. **Cache (navegador/CDN)**
   - Se já tiver corrigido o código e mesmo assim não vir a mudança: testar em aba anônima ou com cache desabilitado; em produção, conferir se o deploy da Vercel terminou e se não há cache forte em CDN para as rotas do App.

## Resumo

| Onde você fez a melhoria | Vai aparecer em /boards e /board/:id? |
|--------------------------|--------------------------------------|
| `board.html` ou `boards.html` (raiz) | Não (arquivos removidos; não eram servidos) |
| `public/board.html` ou `public/boards.html` | Não (arquivos removidos; não eram usadas no fluxo normal) |
| `app/boards/page.tsx`, `app/board/[id]/page.tsx`, `components/kanban/*.tsx`, `app/globals.css` | Sim |

Para as melhorias surtirem efeito na implantação, elas precisam estar nos arquivos React e no CSS que as rotas Next.js realmente utilizam.

---

## Plano: fazer funcionar as melhorias do último commit (PR #21)

O commit **1ac7edd** (“melhorias no board”) alterou apenas `board.html` e `public/board.html`. Como a rota real é React, as melhorias abaixo foram/são replicadas nos componentes que servem `/board/:id`.

### Melhorias identificadas no diff (board.html)

| Melhoria | Onde portar |
|----------|-------------|
| Botão **Ver descrição** (👁) ao lado do ID do card | `KanbanCard` + callback no `KanbanBoard` |
| Modal **só-descrição**: título do card + textarea + “Salvar e Fechar” | Novo estado/modal em `KanbanBoard` ou componente `DescModal` |
| **Animação do modal**: fade-in (opacity + visibility + scale) | `CardModal`, `MapaModal` e modal de descrição |
| Wrapper do ID no card (`.card-id-wrap`) | `KanbanCard`: envolver ID + botão em um `div` |

### Checklist de implementação

- [x] Documentar plano (este bloco)
- [x] Adicionar botão “Ver descrição” no `KanbanCard` e modal só-descrição no `KanbanBoard`
- [x] Aplicar animação fade-in nos modais (`card-modal`, `mapa-modal`, modal descrição)
- [x] Garantir estrutura `card-id-wrap` e estilos no `KanbanCard`
- [x] Validar build e fluxo do board em `/board/:id`
