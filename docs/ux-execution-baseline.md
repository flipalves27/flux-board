# Baseline UX — Flux-Board (execução)

Documento de apoio às fases de UX/UI, mobile e identidade visual. Não substitui o plano em `.cursor/plans/`; registra inventário, cenários e convenções técnicas.

## Inventário de fluxos críticos

| Fluxo | Superfícies principais |
|--------|-------------------------|
| Board Kanban | `components/kanban/kanban-board.tsx`, `kanban-board-canvas.tsx`, `board-nlq-dock.tsx`, `board-metrics-strip.tsx`, `board-summary-dock.tsx` |
| Card | `components/kanban/card-modal-layout.tsx`, abas em `card-modal-tabs/` |
| Relatórios | `app/reports/page.tsx`, `components/reports/flux-reports-dashboard.tsx` |
| Onboarding / billing | `app/onboarding/`, `app/billing/page.tsx` |
| Shell autenticado | `components/app-shell.tsx`, `components/sidebar.tsx`, `components/mobile-app-header.tsx` |

## Cenários de teste (desktop e ≤767px)

1. Abrir board, alternar Kanban / Tabela / Timeline; buscar e filtrar por prioridade.
2. Criar card, editar, mover entre colunas (mouse e, no mobile, arrastar após pressão longa ou fluxo equivalente).
3. Abrir modal de card e fechar com Esc / botão; verificar que nenhum FAB ou toast bloqueia o foco.
4. Abrir Copiloto, Insights, Atividade e Daily (desktop: FABs à direita; mobile: botão flutuante único `BoardMobileToolHub` + itens do menu).
5. Tema **claro**, **escuro** e **sistema** (preferências em `context/theme-context.tsx`).
6. Relatórios: scroll vertical, gráficos legíveis, sem overflow horizontal indesejado.
7. Sidebar mobile: abrir drawer, navegar, fechar (gesto/backdrop).

## Identidade visual (checklist por PR)

- Cores e superfícies: variáveis `--flux-*` em `app/globals.css`; Tailwind `flux.*` / `text-flux-*` em `tailwind.config.ts`.
- Tipografia: `font-display` / `font-body`; escala `--flux-text-*`.
- Empilhamento: `z-[var(--flux-z-…)]` conforme escala documentada no bloco **Stacking** em `globals.css`.
- Comando: `npm run lint:flux-colors` quando houver alteração ampla em TSX.

## Escala de empilhamento (referência)

Valores centralizados em `:root` como `--flux-z-*`. Ordem relativa preservada em relação ao comportamento anterior (modais acima do canvas; paleta de comandos acima de modais comuns; tooltips/diagnostics no topo).
