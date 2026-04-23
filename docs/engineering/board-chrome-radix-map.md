# Board chrome — Radix primitives map

## Implemented

| Interaction | Radix primitive | Location |
|---------------|-----------------|----------|
| L2 / L3 strips collapsed on small viewports | `@radix-ui/react-collapsible` | `board-chrome-layer-collapsible.tsx`, used from `board-chrome-sticky.tsx` |

Collapsible keeps closed panels out of the tab order (`data-[state=closed]:hidden` on content) and exposes expand/collapse with `aria-controls` / `aria-labelledby` on the region.

## Good candidates for `@radix-ui/react-popover` (not implemented in this pass)

| Interaction | Rationale |
|-------------|-----------|
| Sprint inline badge (compact L1) | On very narrow screens, show ring chart + actions in a popover instead of shrinking inline text. |
| Matrix weight filter overflow | When many methodology chips wrap awkwardly, tuck secondary filters in a popover anchored to “Matriz”. |
| Board priority chip overflow | If the priority strip grows with custom org labels, overflow menu in a popover reduces horizontal scroll. |

Popover would add bundle size and focus-trap behaviour; introduce one surface at a time after design sign-off.

## Dropdown menus already on Radix

`@radix-ui/react-dropdown-menu` is already used in the codebase (e.g. card toolbars). Prefer extending existing menu patterns before adding duplicate primitives.
