/**
 * Mapa canônico de produto (planos Flux-Board).
 *
 * - **Persistência**: `Organization.plan` em `lib/kv-organizations.ts` + campos Stripe (`stripe*`).
 * - **Limites numéricos** (boards/usuários, carências): `lib/billing-limits.ts`.
 * - **Matriz feature ↔ tier**: `PLAN_FEATURE_MATRIX` / `FeatureKey` em `lib/plan-gates.ts`.
 * - **Checkout Stripe**: apenas Pro e Business (`lib/billing.ts`). Enterprise é contrato manual / fora do checkout.
 * - **Webhooks**: estado de assinatura sincronizado via `customer.subscription.*` em `handleStripeWebhook` (`lib/billing.ts`).
 * - **Bypass**: `platform_admin` sempre enterprise em gates; admin/executivo da org só com `FLUX_ADMIN_SUPERPOWERS=1`.
 *
 * **Contexto por tipo de usuário (UI)**:
 * - Plano efetivo para regras de produto: `getEffectiveTier(org, planGateCtxFromAuthPayload(jwt))` em `lib/plan-gates.ts`.
 * - Branding e `org.plan` exibidos: `OrgBrandingContext` (`context/org-branding-context.tsx`) — não confundir com bypass do admin da plataforma.
 * - CTAs de trial/upgrade que olham só `org.plan`: usar `shouldHideOrgBillingNudges` em `lib/plan-ui-context.ts` para `platform_admin`.
 *
 * **Config global comercial** (admin da plataforma): `lib/platform-commercial-settings.ts` — vitrine, flags de catálogo,
 * Price IDs efetivos (Mongo + env), listas legadas para webhooks. API: `GET /api/platform/commercial-catalog`, `PATCH /api/platform/commercial-settings`.
 *
 * Prefixos API (mental model):
 * - `/api/billing/*` — Stripe (checkout, portal, webhook).
 * - `/api/platform/*` — catálogo público e config comercial (admin plataforma).
 * - `/api/organizations/*`, `/api/org/*` — dados e recursos escopados à organização.
 * - `/api/boards/*` — workspace por board.
 */

export const PLAN_TIERS_DOC = ["free", "trial", "pro", "business", "enterprise"] as const;
