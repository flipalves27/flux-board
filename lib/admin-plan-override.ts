import type { Organization } from "./kv-organizations";

/**
 * Permite que admins alterem o `plan` da organização via UI/API (PUT /api/organizations/me).
 * Ative só em ambientes controlados (ex.: Vercel preview, staging, demo interna).
 */
export function allowAdminPlanOverrideFromEnv(): boolean {
  const v = (process.env.FLUX_ALLOW_ADMIN_PLAN_OVERRIDE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Assinatura ativa no Stripe — override manual do plano conflitaria com o billing. */
export function hasStripeSubscription(org: Organization | null | undefined): boolean {
  const id = org?.stripeSubscriptionId;
  return typeof id === "string" && id.trim().length > 0;
}

/**
 * Override manual só com env ativa **e** sem `stripeSubscriptionId`.
 * Quem paga via Stripe deve mudar plano no portal / webhook, não pelo banco.
 */
export function canAdminOverridePlan(org: Organization | null | undefined): boolean {
  return allowAdminPlanOverrideFromEnv() && !hasStripeSubscription(org);
}

/** Para UI: env ligada mas org ainda tem subscription Stripe. */
export function planOverrideBlockedByStripe(org: Organization | null | undefined): boolean {
  return allowAdminPlanOverrideFromEnv() && hasStripeSubscription(org);
}

/**
 * Novo Checkout Stripe (nova assinatura) só é adequado sem assinatura ativa.
 * Com `stripeSubscriptionId` em estado ativo, o admin deve usar o Customer Portal
 * para trocar plano (Pro ↔ Business), seats ou intervalo — evita assinatura duplicada.
 */
export function shouldAllowStripeCheckoutForOrg(org: Organization | null | undefined): boolean {
  if (!hasStripeSubscription(org)) return true;
  const st = String(org?.stripeStatus ?? "").toLowerCase();
  if (st === "canceled" || st === "cancelled" || st === "incomplete_expired") return true;
  return false;
}
