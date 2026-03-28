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
 * Prefixos API (mental model):
 * - `/api/billing/*` — Stripe (checkout, portal, webhook).
 * - `/api/organizations/*`, `/api/org/*` — dados e recursos escopados à organização.
 * - `/api/boards/*` — workspace por board.
 */

export const PLAN_TIERS_DOC = ["free", "trial", "pro", "business", "enterprise"] as const;
