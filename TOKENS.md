# Flux-Board design tokens

All visual primitives live in [`app/globals.css`](app/globals.css) as CSS custom properties. Dark defaults are set on `:root`; `[data-theme="light"]` overrides surfaces, borders, chrome tints, and shadows so the same variable names work in both themes.

Use tokens in React via Tailwind arbitrary values, e.g. `border-[var(--flux-border-default)]`, or via the Tailwind theme extensions in [`tailwind.config.ts`](tailwind.config.ts) (`text-flux-primary`, `p-flux-4`, `shadow-flux-md`, etc.).

---

## Spacing (`--flux-space-*`)

Geometric-ish scale from **4px** to **48px**:

| Token           | Value |
|-----------------|-------|
| `--flux-space-1`  | 4px  |
| `--flux-space-2`  | 5px  |
| `--flux-space-3`  | 6px  |
| `--flux-space-4`  | 8px  |
| `--flux-space-5`  | 10px |
| `--flux-space-6`  | 12px |
| `--flux-space-7`  | 16px |
| `--flux-space-8`  | 20px |
| `--flux-space-9`  | 24px |
| `--flux-space-10` | 32px |
| `--flux-space-11` | 40px |
| `--flux-space-12` | 48px |

Tailwind: `p-flux-6`, `gap-flux-4`, etc.

---

## Typography (`--flux-text-*`)

| Token              | Size  |
|--------------------|-------|
| `--flux-text-xs`   | 11px  |
| `--flux-text-sm`   | 13px  |
| `--flux-text-base` | 14px  |
| `--flux-text-lg`   | 16px  |
| `--flux-text-xl`   | 20px  |
| `--flux-text-2xl`  | 24px  |
| `--flux-text-3xl`  | 30px  |

Base `html` font size remains **14px** (`--flux-text-base`). Tailwind: `text-flux-sm`, `text-flux-lg`, …

---

## Elevation (`--flux-shadow-*`)

| Token                      | Role |
|----------------------------|------|
| `--flux-shadow-sm`         | Subtle lift |
| `--flux-shadow-md`         | Cards, panels (alias: `--shadow-md`) |
| `--flux-shadow-lg`         | Prominent panels |
| `--flux-shadow-xl`         | Hero / emphasis |
| `--flux-shadow-drag`       | Dragging cards (alias: `--shadow-drag`) |
| `--flux-shadow-elevated-card` | Auth / settings shells |
| `--flux-shadow-modal-depth` | Card modal stack |
| `--flux-shadow-toast`      | Toasts |
| `--flux-shadow-kanban-column` | Column chrome |
| `--flux-shadow-kanban-card-lift` | Active drag preview |

Tailwind: `shadow-flux-md`, `shadow-flux-drag`, …

---

## Motion

| Token                  | Value |
|------------------------|-------|
| `--flux-ease-standard` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--flux-transition-fast`   | `150ms` + standard ease |
| `--flux-transition-normal` | `250ms` + standard ease |
| `--flux-transition-slow`     | `400ms` + standard ease |

Tailwind: `duration-flux-fast`, `ease-flux-standard`, etc.

---

## Breakpoints

Media queries cannot use CSS variables. Align with Tailwind (see `tailwind.config.ts`):

| Name | Min width |
|------|-----------|
| `sm` | 640px  |
| `md` | 768px  |
| `lg` | 1024px |
| `xl` | 1280px |
| `2xl`| 1536px |

Optional narrow utility: `flux-xs` → **400px** (`max-[400px]:…` / custom `screens.flux-xs`).

---

## Core brand & surfaces

Semantic colors: `--flux-primary`, `--flux-secondary`, `--flux-accent`, `--flux-text`, `--flux-text-muted`, `--flux-surface-*`, `--flux-success`, `--flux-warning`, `--flux-danger`, `--flux-info`, borders (`--flux-border-*`), radii (`--flux-rad*`), mesh (`--flux-board-mesh`), etc. — see `:root` in `globals.css`.

---

## Alpha & utility ramps

Theme-aware **chrome** tints (white mist on dark, ink mist on light): `--flux-chrome-alpha-03` … `--flux-chrome-alpha-20`, plus `--flux-chrome-alpha-30`, `80`, `90`.

**Brand alphas**: `--flux-primary-alpha-*`, `--flux-secondary-alpha-*`, `--flux-danger-alpha-*`, `--flux-info-alpha-*`, `--flux-warning-alpha-*`, `--flux-success-alpha-*`, `--flux-accent-alpha-*`, `--flux-teal-*`, `--flux-emerald-*`, `--flux-amber-*`, `--flux-gold-*`.

**Neutrals**: `--flux-black-alpha-*`, `--flux-backdrop-scrim`, `--flux-tooltip-surface`, `--flux-surface-card-deep-85`, etc.

**Third-party / map accents**: `--flux-mapa-*`, `--flux-indigo-500-alpha-12`, `--flux-red-500-alpha-08`.

---

## Linting

- **ESLint** (`npm run lint:flux-colors`, rule `flux/no-literal-colors`): blocks `#[hex]` and `rgb()/rgba()` inside string literals in `app/`, `components/`, `context/` (excludes `emails/` and `*.test.*`). Config: [`eslint.flux-colors.config.mjs`](eslint.flux-colors.config.mjs); rule implementation: [`eslint-rules/flux-no-literal-colors.mjs`](eslint-rules/flux-no-literal-colors.mjs).
- **Stylelint** (`npm run lint:css`): `function-disallowed-list` for `rgb`/`rgba`/`hsl` on all CSS **except** `app/globals.css`, where tokens are defined.

---

## References

- [Tailwind — theme extension](https://tailwindcss.com/docs/theme)
- [Radix — colors](https://www.radix-ui.com/colors)
- [Open Props](https://open-props.style/)
