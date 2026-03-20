import Stripe from "stripe";
import type { NextRequest } from "next/server";

import { getOrganizationById, updateOrganization } from "./kv-organizations";
import type { Organization } from "./kv-organizations";
import { getUserById } from "./kv-users";

type BillingPlan = Exclude<Organization["plan"], "free">; // "pro" | "business"

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

function getFreeMaxBoards(): number {
  const fromEnv = Number(process.env.FLUX_FREE_MAX_BOARDS ?? "");
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return fromEnv;
  return 3;
}

function getFreeMaxUsers(): number {
  const fromEnvLegacy = Number(process.env.FLUX_MAX_USERS_PER_ORG ?? "");
  if (Number.isFinite(fromEnvLegacy) && fromEnvLegacy >= 1) return fromEnvLegacy;
  const fromEnvFree = Number(process.env.FLUX_FREE_MAX_USERS_PER_ORG ?? "");
  if (Number.isFinite(fromEnvFree) && fromEnvFree >= 1) return fromEnvFree;
  return 1;
}

function getProMaxUsers(): number {
  const fromEnv = Number(process.env.FLUX_PRO_MAX_USERS_PER_ORG ?? "");
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return fromEnv;
  return 10;
}

function getBusinessMaxUsers(): number {
  const fromEnv = Number(process.env.FLUX_BUSINESS_MAX_USERS_PER_ORG ?? "");
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return fromEnv;
  return 1_000_000; // "ilimitado" operacionalmente
}

function getPaidMaxBoards(): number {
  const fromEnv = Number(process.env.FLUX_PAID_MAX_BOARDS ?? "");
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return fromEnv;
  return 1_000_000;
}

function getStripePriceIds() {
  const pro = process.env.STRIPE_PRICE_ID_PRO;
  const business = process.env.STRIPE_PRICE_ID_BUSINESS;
  if (!pro) throw new Error("Missing env var: STRIPE_PRICE_ID_PRO");
  if (!business) throw new Error("Missing env var: STRIPE_PRICE_ID_BUSINESS");
  return { pro, business };
}

let stripeSingleton: Stripe | null = null;
function stripe(): Stripe {
  if (stripeSingleton) return stripeSingleton;
  stripeSingleton = new Stripe(readEnv("STRIPE_SECRET_KEY"));
  return stripeSingleton;
}

export async function createCheckoutSession(input: {
  orgId: string;
  plan: BillingPlan;
  seats: number;
}): Promise<{ url: string; sessionId: string }> {
  const { pro: proPriceId, business: businessPriceId } = getStripePriceIds();

  const org = await getOrganizationById(input.orgId);
  if (!org) throw new Error("Organization não encontrada");

  const seatsRaw = Number(input.seats);
  const seats = Number.isFinite(seatsRaw) ? Math.max(1, Math.floor(seatsRaw)) : 1;

  const plan = input.plan;
  if (plan === "pro") {
    const cap = getProMaxUsers();
    // Pro é limitado por tier (10 usuários na imagem, por default).
    if (seats > cap) throw new Error(`Tier Pro comporta até ${cap} usuário(s).`);
  }

  const priceId = plan === "pro" ? proPriceId : businessPriceId;
  const customerId = org.stripeCustomerId;

  // Email ajuda Stripe a criar o customer corretamente quando não temos `stripeCustomerId` ainda.
  const owner = await getUserById(org.ownerId, org._id).catch(() => null);
  const customerEmail = owner?.email || undefined;

  const successUrl =
    process.env.STRIPE_CHECKOUT_SUCCESS_URL || `${appBaseUrl()}/boards?billing=success`;
  const cancelUrl =
    process.env.STRIPE_CHECKOUT_CANCEL_URL || `${appBaseUrl()}/boards?billing=cancel`;

  const metadata: Record<string, string> = {
    orgId: input.orgId,
    plan,
    seats: String(seats),
  };

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: seats }],
    success_url: successUrl.includes("?")
      ? `${successUrl}&session_id={CHECKOUT_SESSION_ID}`
      : `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    allow_promotion_codes: false,
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

  const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || `${appBaseUrl()}/boards`;

  const session = await stripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

function isoFromUnixSeconds(s: number | null | undefined): string | undefined {
  if (typeof s !== "number" || !Number.isFinite(s)) return undefined;
  return new Date(s * 1000).toISOString();
}

function resolveBillingTierFromSubscription(subscription: Stripe.Subscription): BillingPlan | null {
  const metaPlan = subscription.metadata?.plan;
  if (metaPlan === "pro" || metaPlan === "business") return metaPlan;

  const { pro: proPriceId, business: businessPriceId } = getStripePriceIds();
  const priceId = subscription.items.data?.[0]?.price?.id;
  if (!priceId) return null;
  if (priceId === proPriceId) return "pro";
  if (priceId === businessPriceId) return "business";
  return null;
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
      next.maxUsers = typeof seats === "number" ? seats : getBusinessMaxUsers();
    }
  } else {
    next.plan = "free";
    next.maxBoards = getFreeMaxBoards();
    next.maxUsers = getFreeMaxUsers();
  }

  // Billing metadata (mantemos stripeCustomerId quando disponível).
  if (customerId) next.stripeCustomerId = customerId;
  next.stripeSubscriptionId = subscription.id;
  if (priceId) next.stripePriceId = priceId;
  next.stripeStatus = subscription.status;
  // `current_period_end` pode variar entre versões tipadas do Stripe.
  next.stripeCurrentPeriodEnd = isoFromUnixSeconds((subscription as any).current_period_end);
  if (typeof seats === "number") next.stripeSeats = seats;

  await updateOrganization(orgId, next as any);
}

export async function handleStripeWebhook(request: NextRequest): Promise<{ handled: boolean }> {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return { handled: false };

  const rawBody = await request.text();
  const event = stripe().webhooks.constructEvent(rawBody, sig, readEnv("STRIPE_WEBHOOK_SECRET"));

  const type = event.type;
  if (!["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(type)) {
    return { handled: false };
  }

  const subscription = event.data.object as Stripe.Subscription;
  const orgId = subscription.metadata?.orgId;
  if (!orgId) return { handled: false };

  // Deleted -> downgrade para free.
  if (type === "customer.subscription.deleted") {
    const tier = resolveBillingTierFromSubscription(subscription) ?? "pro";
    await applySubscriptionStateToOrganization({
      orgId,
      subscription,
      tier,
      isActive: false,
    });
    return { handled: true };
  }

  const isActive = subscription.status === "active" || subscription.status === "trialing";
  const tier = resolveBillingTierFromSubscription(subscription);
  if (!tier) return { handled: false };

  await applySubscriptionStateToOrganization({
    orgId,
    subscription,
    tier,
    isActive,
  });

  return { handled: true };
}

