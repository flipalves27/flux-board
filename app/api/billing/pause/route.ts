import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { denyStripeCommercialForPlatformAdmin, ensureOrgManager } from "@/lib/api-authz";
import { billingErrorMessageForClient, pauseSubscriptionForOrg } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;
  const platformStripe = denyStripeCommercialForPlatformAdmin(payload);
  if (platformStripe) return platformStripe;

  try {
    await pauseSubscriptionForOrg(payload.orgId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: billingErrorMessageForClient(err) }, { status: 400 });
  }
}
