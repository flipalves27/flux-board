/**
 * Stripe — modelo de sincronização
 *
 * - Webhook (`handleStripeWebhook`): apenas `customer.subscription.created|updated|deleted`.
 *   Outros eventos (ex. `invoice.payment_failed`) retornam 200 com `ignored_event_type` — o estado do produto
 *   segue o objeto subscription em `updated` (ex. status `past_due` não é `active`/`trialing`, então tratamos como inativo).
 * - **Um line item principal**: tier e seats vêm de `subscription.items.data[0]` (`metadata.plan`, IDs ativos/legados em
 *   `lib/platform-commercial-settings.ts`, fallback `STRIPE_PRICE_ID_*` no env). Add-ons exigiriam iterar itens ou metadata adicional.
 * - Enterprise não passa por checkout; plano `enterprise` na org é operacional/manual.
 */
import Stripe from "stripe";
import type { NextRequest } from "next/server";

import { routing } from "@/i18n";
import {
  getOrganizationById,
  updateOrganization,
  updateOrganizationWithUnset,
} from "./kv-organizations";
import type { Organization } from "./kv-organizations";
import { getUserById } from "./kv-users";
import {
  addDaysIso,
  DOWNGRADE_GRACE_DAYS,
  getBusinessMaxUsers,
  getFreeMaxBoards,
  getFreeMaxUsers,
  getPaidMaxBoards,
  getProMaxUsers,
  PAUSE_BILLING_DAYS,
} from "./billing-limits";
import { getEffectiveStripePriceIds, resolveBillingPlanFromStripeSubscription } from "./platform-commercial-settings";

/** Planos cobrados via Stripe (Enterprise é contrato manual / fora do checkout). */
type BillingPlan = "pro" | "business";

function readEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function appBaseUrl(): string {
  const v =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL;
  if (!v) return "http://localhost:3000";
  const withProto = v.startsWith("http://") || v.startsWith("https://") ? v : `https://${v}`;
  return withProto.replace(/\/+$/, "");
}

/** Locale prefix para URLs de retorno do Checkout (pt-BR | en). */
export function resolveCheckoutLocale(locale: string | undefined): string {
  const allowed = new Set<string>(routing.locales as readonly string[]);
  if (locale && allowed.has(locale)) return locale;
  return routing.defaultLocale;
}

let stripeSingleton: Stripe | null = null;
function stripe(): Stripe {
  if (stripeSingleton) return stripeSingleton;
  stripeSingleton = new Stripe(readEnv("STRIPE_SECRET_KEY"));
  return stripeSingleton;
}

export type CheckoutBillingInterval = "month" | "year";

export async function createCheckoutSession(input: {
  orgId: string;
  plan: BillingPlan;
  seats: number;
  /** Mensal (Stripe default) ou anual (`STRIPE_PRICE_ID_*_ANNUAL`). */
  interval?: CheckoutBillingInterval;
  /** next-intl locale — usado nos defaults de success/cancel quando env não sobrescreve. */
  locale?: string;
}): Promise<{ url: string; sessionId: string }> {
  const ids = await getEffectiveStripePriceIds();

  const org = await getOrganizationById(input.orgId);
  if (!org) throw new Error("Organization não encontrada");

  const seatsRaw = Number(input.seats);
  const seats = Number.isFinite(seatsRaw) ? Math.max(1, Math.floor(seatsRaw)) : 1;

  const plan = input.plan;
  if (plan === "pro") {
    const cap = getProMaxUsers();
    if (seats > cap) throw new Error(`Tier Pro comporta até ${cap} usuário(s).`);
  }

  const wantYear = input.interval === "year";
  let priceId: string;
  if (plan === "pro") {
    priceId = wantYear && ids.proAnnual ? ids.proAnnual : ids.pro;
    if (wantYear && !ids.proAnnual) {
      console.warn("[billing] STRIPE_PRICE_ID_PRO_ANNUAL ausente — usando preço mensal.");
      priceId = ids.pro;
    }
  } else {
    priceId = wantYear && ids.businessAnnual ? ids.businessAnnual : ids.business;
    if (wantYear && !ids.businessAnnual) {
      console.warn("[billing] STRIPE_PRICE_ID_BUSINESS_ANNUAL ausente — usando preço mensal.");
      priceId = ids.business;
    }
  }
  const customerId = org.stripeCustomerId;

  const owner = await getUserById(org.ownerId, org._id).catch(() => null);
  const customerEmail = owner?.email || undefined;

  const loc = resolveCheckoutLocale(input.locale);
  const successUrl =
    process.env.STRIPE_CHECKOUT_SUCCESS_URL ||
    `${appBaseUrl()}/${loc}/billing/checkout/return?result=success`;
  const cancelUrl =
    process.env.STRIPE_CHECKOUT_CANCEL_URL ||
    `${appBaseUrl()}/${loc}/billing/checkout/return?result=cancel`;

  const metadata: Record<string, string> = {
    orgId: input.orgId,
    plan,
    seats: String(seats),
    billingInterval: wantYear ? "year" : "month",
  };

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: seats }],
    success_url: successUrl.includes("?")
      ? `${successUrl}&session_id={CHECKOUT_SESSION_ID}`
      : `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    customer: customerId || undefined,
    customer_email: customerEmail,
    subscription_data: {
      metadata,
    },
    metadata,
  });

  if (!session.url) throw new Error("Stripe session.url não retornou URL.");
  return { url: session.url, sessionId: session.id };
}

export async function createPortalSession(input: { orgId: string }): Promise<{ url: string }> {
  const org = await getOrganizationById(input.orgId);
  if (!org) throw new Error("Organization não encontrada");
  if (!org.stripeCustomerId) throw new Error("Organization sem stripeCustomerId.");

  const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || `${appBaseUrl()}/billing`;

  const session = await stripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

export type StripeInvoiceRow = {
  id: string;
  number: string | null;
  status: string | null;
  created: number;
  amountDue: number;
  currency: string;
  invoicePdf: string | null;
  hostedInvoiceUrl: string | null;
};

export async function listStripeInvoicesForOrg(orgId: string): Promise<StripeInvoiceRow[]> {
  const org = await getOrganizationById(orgId);
  if (!org?.stripeCustomerId) return [];
  const invoices = await stripe().invoices.list({
    customer: org.stripeCustomerId,
    limit: 40,
  });
  return invoices.data.map((inv) => ({
    id: inv.id,
    number: inv.number ?? null,
    status: inv.status ?? null,
    created: inv.created,
    amountDue: inv.amount_due,
    currency: inv.currency,
    invoicePdf: inv.invoice_pdf ?? null,
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
  }));
}

export async function pauseSubscriptionForOrg(orgId: string): Promise<void> {
  const org = await getOrganizationById(orgId);
  if (!org?.stripeSubscriptionId) throw new Error("Nenhuma assinatura Stripe vinculada.");
  const resumesAt = Math.floor(Date.now() / 1000) + PAUSE_BILLING_DAYS * 24 * 60 * 60;
  await stripe().subscriptions.update(org.stripeSubscriptionId, {
    pause_collection: {
      behavior: "void",
      resumes_at: resumesAt,
    },
  });
}

function isoFromUnixSeconds(s: number | null | undefined): string | undefined {
  if (typeof s !== "number" || !Number.isFinite(s)) return undefined;
  return new Date(s * 1000).toISOString();
}


async function applySubscriptionStateToOrganization(params: {
  orgId: string;
  subscription: Stripe.Subscription;
  tier: BillingPlan;
  isActive: boolean;
}): Promise<void> {
  const { orgId, subscription, tier, isActive } = params;
  const org = await getOrganizationById(orgId);
  if (!org) return;

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const priceId = subscription.items.data?.[0]?.price?.id;
  const seatsRaw = subscription.items.data?.[0]?.quantity;
  const seats = typeof seatsRaw === "number" ? seatsRaw : seatsRaw ? Number(seatsRaw) : undefined;

  const next: Partial<Organization> = {};

  if (isActive) {
    next.plan = tier;
    next.maxBoards = getPaidMaxBoards();

    if (tier === "pro") {
      const cap = getProMaxUsers();
      const nextSeats = typeof seats === "number" ? Math.min(seats, cap) : cap;
      next.maxUsers = nextSeats;
    } else {
      // business (Stripe)
      next.maxUsers = typeof seats === "number" ? seats : getBusinessMaxUsers();
    }
  } else {
    next.plan = "free";
    next.downgradeGraceEndsAt = addDaysIso(DOWNGRADE_GRACE_DAYS);
    next.downgradeFromTier = tier;
    // Mantém maxUsers/maxBoards até `downgradeGraceEndsAt` (sync lazy em kv-organizations).
  }

  if (customerId) next.stripeCustomerId = customerId;
  next.stripeSubscriptionId = subscription.id;
  if (priceId) next.stripePriceId = priceId;
  next.stripeStatus = subscription.status;
  next.stripeCurrentPeriodEnd = isoFromUnixSeconds((subscription as any).current_period_end);
  if (typeof seats === "number") next.stripeSeats = seats;

  if (isActive) {
    await updateOrganizationWithUnset(orgId, next as any, ["trialEndsAt", "downgradeGraceEndsAt", "downgradeFromTier"]);
  } else {
    await updateOrganizationWithUnset(orgId, next as any, ["trialEndsAt"]);
  }
}

export async function handleStripeWebhook(
  request: NextRequest
): Promise<{ handled: boolean; status: number; reason?: string }> {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return { handled: false, status: 400, reason: "missing_signature" };

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, readEnv("STRIPE_WEBHOOK_SECRET"));
  } catch {
    return { handled: false, status: 400, reason: "invalid_signature" };
  }

  const type = event.type;
  if (!["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(type)) {
    return { handled: false, status: 200, reason: "ignored_event_type" };
  }

  const subscription = event.data.object as Stripe.Subscription;
  const orgId = subscription.metadata?.orgId;
  if (!orgId) return { handled: false, status: 400, reason: "missing_org_id_metadata" };

  if (type === "customer.subscription.deleted") {
    const tier = (await resolveBillingPlanFromStripeSubscription(subscription)) ?? "pro";
    await applySubscriptionStateToOrganization({
      orgId,
      subscription,
      tier,
      isActive: false,
    });
    return { handled: true, status: 200 };
  }

  const isActive = subscription.status === "active" || subscription.status === "trialing";
  const tier = await resolveBillingPlanFromStripeSubscription(subscription);
  if (!tier) return { handled: false, status: 400, reason: "unmapped_tier" };

  await applySubscriptionStateToOrganization({
    orgId,
    subscription,
    tier,
    isActive,
  });

  return { handled: true, status: 200 };
}

/**
 * Resposta JSON para o cliente em /api/billing/*: não repassa mensagens brutas da Stripe
 * (podem conter IDs de preço / produto configurados no env).
 */
export function billingErrorMessageForClient(err: unknown): string {
  if (!(err instanceof Error)) return "Erro ao processar cobrança.";
  const m = err.message;
  if (
    /no such price|resource_missing|invalid_request|No such customer|No such subscription|No such coupon/i.test(m)
  ) {
    return "Operação indisponível. Revise a configuração Stripe no servidor (Price IDs e chaves) e tente novamente.";
  }
  return m;
}
