# Mobile QA checklist (Flux-Board)

Use this after UI changes that touch layout, touch targets, or public/authenticated shells.

## Viewports

- **360px**, **390px**, **428px** — narrow phones; confirm no horizontal scroll on landing, login, onboarding, portal, forms.
- **768px** — boundary with `SidebarLayout` / `max-md:` (767px and below = mobile drawer + `MobileAppHeader`).

## Platforms

- **iOS Safari** (or embedded WKWebView): viewport scale, notch / Dynamic Island, home indicator; fixed footers (portal) and FABs clear safe areas.
- **Chrome Android**: keyboard opening on login/forms does not trap focus; scrollable regions behave (nested scroll on board canvas already uses `overscroll-contain` in shell).

## Lighthouse (mobile)

- Run Chrome DevTools → Lighthouse → Mobile; note **tap targets** and **legibility** (best-effort, no hard score gate in CI).

## Accessibility

- Drawer: focus returns after close; `aria-*` on mobile nav (landing + sidebar) remains valid.
- **Reduce motion**: OS setting disables landing shimmer/float where `prefers-reduced-motion` is wired in `app/globals.css`.

## Authenticated shell

- Below 768px: **hamburger** opens sidebar; routine toasts sit above home indicator; Kanban top chrome clears `MobileAppHeader` + safe inset (sticky offset).

## Related docs

- Breakpoint alignment with JS: `TOKENS.md` (767px / `max-md:`).
- Root viewport: `viewportFit: "cover"` in `app/layout.tsx` plus `.flux-safe-*` utilities in `app/globals.css`.
