import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { denyStripeCommercialForPlatformAdmin, ensureOrgTeamManager } from "@/lib/api-authz";
import { getOrganizationById } from "@/lib/kv-organizations";
import { shouldAllowStripeCheckoutForOrg } from "@/lib/admin-plan-override";
import { createCheckoutSession, type CheckoutBillingInterval } from "@/lib/billing";

type BillingPlan = "pro" | "business";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgTeamManager(payload);
  if (denied) return denied;
  const platformStripe = denyStripeCommercialForPlatformAdmin(payload);
  if (platformStripe) return platformStripe;

  const org = await getOrganizationById(payload.orgId);
  if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });

  if (!shouldAllowStripeCheckoutForOrg(org)) {
    return NextResponse.json(
      {
        error:
          "Esta organização já possui assinatura ativa no Stripe. Use o Portal do cliente (Billing → Gerenciar assinatura) para trocar de plano, seats ou período.",
      },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const planRaw = body?.plan as unknown;
  const seatsRaw = body?.seats as unknown;
  const intervalRaw = body?.interval as unknown;

  const plan: BillingPlan = planRaw === "pro" || planRaw === "business" ? planRaw : "pro";
  const interval: CheckoutBillingInterval =
    intervalRaw === "year" || intervalRaw === "annual" ? "year" : "month";

  const seatsCandidate = typeof seatsRaw === "number" ? seatsRaw : undefined;
  const seats =
    typeof seatsCandidate === "number" && Number.isFinite(seatsCandidate)
      ? Math.floor(seatsCandidate)
      : Math.max(1, org.maxUsers || 1);
  if (seats < 1) return NextResponse.json({ error: "seats deve ser >= 1" }, { status: 400 });

  try {
    const session = await createCheckoutSession({ orgId: payload.orgId, plan, seats, interval });
    return NextResponse.json({ url: session.url, sessionId: session.sessionId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 400 }
    );
  }
}

