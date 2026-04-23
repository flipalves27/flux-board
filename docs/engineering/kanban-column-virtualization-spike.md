# Kanban column list virtualization (spike)

## What was added

- Dependency: `@tanstack/react-virtual`.
- Opt-in flag: set `NEXT_PUBLIC_FLUX_KANBAN_VIRTUAL=1` in the environment. When set, columns with at least `KANBAN_COLUMN_CARD_CV_THRESHOLD` cards render the list through `VirtualKanbanColumnCardList` (`kanban-column-card-list-virtual.tsx`) instead of the classic DOM map.
- Implementation files: `components/kanban/kanban-column-card-list.tsx`, `components/kanban/kanban-column-card-list-virtual.tsx`, `components/kanban/kanban-column-droppable-slot.tsx` (shared drop slot).

## Feasibility and risks

**What works**

- Reduces DOM size for long columns; scroll container is the existing column body (`overflow-y-auto`).
- `DragOverlay` from `@dnd-kit` continues to show the dragged card; visible rows still register drag/drop sensors.

**Known limitations (why this stays behind a flag)**

1. **Off-screen drop targets**: `KanbanColumnDroppableSlot` instances for indices outside the virtual window are not mounted. Collision detection that relies on those slot nodes will not see “between two off-screen cards” positions until a fuller model (e.g. pointer-based custom collision, or always-mounted logical slots) is implemented.
2. **Row height**: Rows use `measureElement` with a fixed initial `estimateSize`. Very tall cards (long descriptions, many badges) may need tuning or larger `TAIL_RESERVE_PX` in the virtual module.
3. **SortableContext**: Cards use `useDraggable` per card, not `useSortable` on the list; this matches the pre-spike architecture. Reordering still goes through existing slot IDs; virtual mode does not change the DnD contract, only what is mounted.

## Recommended next steps before enabling by default

1. Spike **custom collision detection** (pointer + rect cache) so insert positions do not depend on every slot being in the DOM.
2. Run manual QA: drag across column boundaries, multi-select batch drag, touch `touchAction` on narrow viewports.
3. Add a Playwright scenario with the env flag on a board with many synthetic cards.

Until then, keep `NEXT_PUBLIC_FLUX_KANBAN_VIRTUAL` unset in production.
