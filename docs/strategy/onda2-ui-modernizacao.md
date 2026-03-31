# Onda 2 - Pacote de Modernizacao Visual

## Objetivo
Elevar o nivel visual para padrao premium com ganhos claros de percepcao sem penalizar performance e acessibilidade.

## Escopo do Pacote
- Glassmorphism 2.0 para paineis criticos.
- Microinteracoes em cards.
- Transicoes consistentes para paineis e rotas.
- Dashboard executivo estilo bento grid.
- Command palette global.
- Toast stack e empty states com identidade Fluxy.

## Arquivos Base
- `app/globals.css`
- `tailwind.config.ts`
- `components/kanban/kanban-card.tsx`
- `components/kanban/kanban-board.tsx`
- `components/reports/flux-reports-dashboard.tsx`
- `components/fluxy/fluxy-avatar.tsx`

## Entregas Tecnicas

### 1) Design Tokens e Utilitarios
- Adicionar camada de tokens para glass:
  - `--flux-glass-surface-*`
  - `--flux-glass-elevated-*`
  - `--flux-glass-focus-*`
- Definir utilitarios para shimmer e transicoes padrao.
- Consolidar easing padrao para microinteracoes.

### 2) Cards Kanban Premium
- Hover lift com elevacao progressiva.
- Pulse de prioridade para estados criticos/bloqueados.
- Drag ghost com escala leve + sombra contextual.
- Preparar ponto de extensao para progress ring de subtasks.

### 3) Painel e Rotas
- Padronizar entrada de side panels (`slide-in-right + fade`).
- Fallback para ambientes sem suporte a view transitions.
- Atualizar skeleton para shimmer gradiente (respeitando reduced motion).

### 4) Dashboard Executivo
- Reorganizar blocos em layout bento responsivo.
- Introduzir sparklines de tendencia em KPIs.
- Animacao staggered em graficos sem travar interacao.

### 5) Command Palette Global
- Atalho global (Cmd/Ctrl + K).
- Busca federada inicial:
  - boards
  - cards
  - docs
  - sprints
- Acoes rapidas: abrir board, criar card, navegar para docs.

## Metas de Performance e Qualidade
- Lighthouse em paginas criticas: `>= 90`.
- CLS global: `< 0.1`.
- Sem regressao de TTI perceptivel no board principal.
- `prefers-reduced-motion` respeitado em todas as animacoes novas.
- Contraste minimo AA; alvo AAA em charts e badges de tema claro.

## Quality Gate de UI (por PR)
- Capturas visuais (antes/depois) dos componentes afetados.
- Checklist de acessibilidade:
  - foco visivel
  - navegacao por teclado
  - contraste
- Smoke test funcional no board:
  - drag card
  - abrir modal
  - abrir copilot
- Medicao de Web Vitals em preview.
- Artefato executavel: `npm run quality:gates:ui`
  - saida em `docs/reports/ui-quality-gate-latest.md`

## Sequencia de PRs
- **PR-11** Tokens glass + utilitarios de motion/shimmer.
- **PR-12** `kanban-card` microinteracoes + drag ghost polish.
- **PR-13** transicoes de paineis e skeleton shimmer.
- **PR-14** dashboard bento + sparklines + animacao chart.
- **PR-15** command palette v1 + atalhos.
- **PR-16** toast stack redesign + empty states Fluxy.

## Criterios de Aceite
- Pacote visual aplicado em board, dashboard e paineis principais.
- Mudancas perceptiveis e consistentes entre dark/light.
- Sem degradacao relevante de performance.
- Acessibilidade preservada ou melhorada.

