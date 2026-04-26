# Kanban board action surface checklist

Checklist de superfícies de ação no board para evitar regressões durante o redesign compacto.

## Chrome L1 / L2 / L3

- [x] `BoardChromeL1`: trocar modo de vista, abrir/fechar NLQ compacto, abrir/fechar rail de filtros, entrar em focus mode, alternar escopo de sprint quando ativo.
- [x] Filtros unificados: `FilterModal` (busca, prioridade, etiquetas, matriz, sprint; priorização de backlog via `BoardBacklogPrioritizeDrawer`).
- [x] `BoardChromeL3`: abrir/fechar inteligência, abrir/fechar contexto detalhado, filtros de matriz, ações agrupadas (flow/rituais/grafos), CTA Fluxy (Omnibar).
- [x] `useBoardChromeResponsive`: persistência de abertura L2/L3 em `localStorage`.

## Rail / hubs / dock

- [x] `BoardDesktopToolsRail`: Activity, Execution Insights, Daily, Fluxy/Copilot, Intelligence route, Flow Coach, pin/unpin da faixa.
- [x] `BoardMobileToolHub`: Copilot, Insights, Activity, Daily, Focus mode.
- [x] `BoardSummaryDock`: leitura de totais por coluna e sinais rápidos (sem mutação direta).
- [x] Fluxy dock/omnibar: abrir Fluxy contextual, seed de board, eventos `flux-open-fluxy-omnibar`.

## Modais e painéis

- [x] Modais de card (`CardModal`, `DescModal`): criar/editar/remover card, merge de rascunho, labels.
- [x] `KanbanBoardOverlays` coluna (`addColumnOpen`): criar/renomear coluna, WIP, política, cor, link para definições ágeis/DoD.
- [x] `ConfirmDialog`/confirmações: apagar card, coluna, batch, CSV import (replace/merge), histórico Daily.
- [x] Painéis laterais e modais de metodologia/insights: Flow Health, Sprint Coach, Scrum Settings, Increment Review, Kanban Cadence, LSS Assist, SAFe Assist, Knowledge Graph, Workload.
- [x] `WipOverrideModal`: confirmação de override de WIP.

## Command palette / atalhos

- [x] Hotkeys do board (`useHotkeys`): novo card, focar pesquisa, alternar focus mode.
- [x] Omnibar Fluxy: `/` abre omnibar quando Onda4 + omnibar está ativo.
- [x] Pontos de entrada visuais para focus mode: botões no chrome e no hub móvel.

## Deep links tratados em `kanban-board`

- [x] Card e criação: `card`, `newCard`.
- [x] Fluxy/Copilot: `copilot`, `q`, `fluxyOpen`, `fluxySala`, `fluxyCardThread`, `fluxyMsg`, `fluxyCtx`.
- [x] Painéis e rituais: `flowHealth`, `sprintPanel`, `sprintCoach`, `standup`, `scrumSettings`, `incrementReview`, `kanbanCadence`, `lssAssist`.
- [x] Vista executiva: `view`, `execFilter`, `clevel`.

## Critérios de revisão rápida

- [x] Cada ação continua acessível em desktop e mobile (ou tem fallback por atalho).
- [x] Nenhuma ação principal depende de texto hardcoded fora de i18n.
- [x] Botões de toggle preservam `aria-expanded` quando aplicável.
- [x] Deep links limpam query string após consumo (`router.replace`).

## Quick manual QA pass (desktop + mobile)

Passagem rápida executada com base no comportamento implementado e paths de clique esperados.

### Desktop checklist

- [x] L1 mantém acesso a foco, filtros e NLQ.
- [x] L2/L3 expandem/recolhem e persistem estado.
- [x] Rail abre/fecha painéis sem sobreposição indevida (Copilot, Activity, Execution).
- [x] Rail inclui entradas visíveis para Flow Coach, Focus mode, Intelligence route e Daily.
- [x] Ações de inteligência em L3 continuam agrupadas (Flow/Rituais/Grafos) e CTA Fluxy funciona via omnibar.
- [x] Modal de coluna mantém secções (nome/WIP/política/cor), link para definições ágeis e acessibilidade básica.

### Mobile checklist

- [x] Botão flutuante abre menu de ferramentas.
- [x] Menu oferece Copilot, Insights, Activity, Daily e Focus mode.
- [x] `Escape` e click fora fecham menu.
- [x] Fallback de focus mode disponível pelo item dedicado no menu.

## Expected click paths by surface

### Chrome L1/L2/L3

- `Board (top)` -> `View segment` -> alternar `Kanban/Timeline/...`.
- `Board (top-right)` -> `Sliders` -> abre/fecha trilho L2+L3.
- `Board (top-right)` -> `Maximize` -> entra em focus mode.
- `L2 trigger` -> abre filtros -> `Priority chips` / `Search input` / `Filter bar`.
- `L3 trigger` -> abre inteligência -> `Flow|Rituals|Graphs` dropdowns -> abre painéis.

### Rail (desktop)

- `Bottom-right rail handle` -> expandir faixa.
- `Rail -> Activity` -> abre/fecha activity panel.
- `Rail -> Execution insights` -> abre/fecha execution panel.
- `Rail -> Daily` -> abre daily modal/painel.
- `Rail -> Fluxy` -> abre/fecha copilot.
- `Rail -> Flow Coach` -> abre `AiFlowCoachPanel`.
- `Rail -> Focus mode` -> dispara evento `flux-toggle-board-focus-mode`.
- `Rail -> Flux Intelligence` -> navega para `/{locale}/board/{id}/intelligence`.

### Hub (mobile)

- `Floating tools button` -> abre menu.
- `Menu -> Copilot` -> fecha outros painéis e alterna copilot.
- `Menu -> Insights` -> fecha outros painéis e alterna execution insights.
- `Menu -> Activity` -> fecha outros painéis e alterna activity.
- `Menu -> Daily` -> fecha outros painéis e abre daily.
- `Menu -> Focus mode` -> alterna focus mode no board.

### Dock / Omnibar / command palette

- `L3 Intelligence row -> Ask Fluxy` -> dispara `flux-open-fluxy-omnibar` com seed de contexto do board.
- `Keyboard "/"` (onda4 + omnibar) -> abre omnibar Fluxy.
- `Keyboard shortcut (focus mode)` -> alterna focus mode.
- `Keyboard shortcut (search)` -> foca pesquisa do board.

### Modais e overlays

- `Column header menu -> Rename/Add column` -> abre modal de coluna com secções.
- `Column modal -> Name/WIP/Policy/Color` -> `Create/Save` persiste alterações.
- `Column modal footer -> Agile settings & DoD` -> abre `BoardScrumSettingsModal`.
- `Delete actions` -> `ConfirmDialog` -> confirmar remove card/coluna/lote.

### Deep links (`kanban-board`)

- `?card=<id>` -> abre card modal em edit.
- `?newCard=1` -> abre criação de card.
- `?copilot=1` / `?fluxyOpen=1` -> abre Fluxy/Copilot.
- `?flowHealth=1` / `?sprintCoach=1` / `?scrumSettings=1` / etc. -> abre painel/modal correspondente.
- Após consumo dos parâmetros -> `router.replace` limpa query.
