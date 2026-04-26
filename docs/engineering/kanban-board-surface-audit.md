# Kanban board — surface & entry-point checklist

Inventory of user-facing entry points for the board shell (`components/kanban/kanban-board.tsx` and chrome). Use this to avoid duplicating or hiding features when changing layout.

## Chrome (sticky header)

| Layer | Component | User actions |
| --- | --- | --- |
| **L1** | `board-chrome-l1` | View mode segment; sprint badge + scope toggle (scrum); expand NLQ dock; filter rail (L2+L3) toggle; focus mode (when wired). |
| **Filtros** | `filter-modal` + `kanban-board` | Modal único de filtros; priorização de backlog (drawer) acionada a partir do modal. |
| **L3** | `board-chrome-l3` | Daily briefing / anomalies; intelligence row (expand/collapse, chips, grouped actions); product goal / LSS / SAFE strips; matrix weight filter; optional sprint scope strip (when NLQ expanded). |
| **Sticky host** | `board-chrome-sticky` | L2/L3 collapsible layers, Sliders affordance, persisted `localStorage` via `useBoardChromeResponsive`. When the NLQ dock is expanded, the same row also shows **Focus mode** (maximize) + filters rail. |

## Right rail (desktop)

| Component | User actions |
| --- | --- |
| `board-desktop-tools-rail` | Copilot, activity, execution FAB route, daily modal, intelligence route. |

**Note:** Not every board route renders the rail; it is gated in layout next to the canvas in `kanban-board.tsx`.

## “Dock” / NLQ

| Component | User actions |
| --- | --- |
| `board-nlq-dock` (inside L1 when expanded) | NLQ + view + search (pre-Omnibar integration). |
| Fluxy / Omnibar | `flux-open-fluxy-omnibar` from board code; Omnibar store and seed from intelligence / L3. |

## Modals (overlay stack)

Rendered via `KanbanBoardOverlays` and siblings in `kanban-board.tsx`:

- Card `CardModal` (new / edit)
- `DescModal`
- `MapaProducaoSection` (map modal)
- Add / rename **column** (`addColumnOpen`)
- Delete confirmations (card, column, batch, daily history)
- `DailyInsightsPanel` (daily)
- WIP / scrum: `WipOverrideModal`, `BoardScrumSettingsModal`, `BoardIncrementReviewModal`, LSS/SAFe assist, `BoardIncrementReviewModal`, `KanbanCadenceModal`, `KnowledgeGraphModal`, workload balance, flow health, sprint coach, etc. (see JSX in `kanban-board.tsx` around the same file as `BoardScrumSettingsModal`).

## Command palette / hotkeys (board-scoped)

- Global/search: registered in `kanban-board` via hotkey map (e.g. `board.focusSearch` → `/` focus search).
- **Focus mode:** `board.focusMode` (`Control+Shift+f` in `lib/hotkeys/default-bindings.ts`) toggles `focusMode` state; chrome is hidden; `BoardFocusModeBar` is shown.
- **Omnibar (Onda 4):** `⌘K` / `/` and custom event `flux-open-fluxy-omnibar` (see `kanban-board` effect / handlers).

## Deep links (URL query → action)

Handled in a `useEffect` on `searchParams` in `kanban-board.tsx` (strips query after apply). Non-exhaustive list aligned with code:

| Query | Effect |
| --- | --- |
| `card` | Open card modal (optional Fluxy dock context) |
| `newCard=1` | New card in first column |
| `copilot=1` | Open copilot; optional `q` draft |
| `flowHealth=1` | Open flow health panel |
| `sprintPanel=1` | Open sprint panel |
| `sprintCoach=1` | Open sprint coach |
| `standup=1` | Open standup (active sprint) |
| `scrumSettings=1` | Open scrum settings |
| `incrementReview=1` | Open increment review |
| `kanbanCadence=1` | Open Kanban cadence (kanban only) |
| `lssAssist=1` | LSS assist (LSS boards) |
| `fluxyOpen` / `fluxySala` / `fluxyCardThread` / `fluxyMsg` / `fluxyCtx` | Copilot + Fluxy board dock |
| `view` | Board view mode (when allowed) |
| `execFilter` | Executive filter |
| `clevel=1` | Enables **focus mode** (same as deep link) |

**Methodology gates:** e.g. scrum-only links are cleared if methodology is not scrum; `kanbanCadence` if not kanban (see same effect block).

## Regression notes

- **Focus mode:** Hides all of `BoardChromeSticky`; only `BoardFocusModeBar` + canvas chromeless area.
- **L2 with NLQ:** When `nlqExpanded` and not Omnibar, L2 can hide the compact search row; rail summary in sticky still shows search in `l2TriggerSummary`.

This checklist should be updated when new query params, modals, or rail tools are added.
