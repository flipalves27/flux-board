import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { denyStripeCommercialForPlatformAdmin, ensureOrgManager } from "@/lib/api-authz";
import { reconcileOrganizationFromStripeCheckoutSessionId } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;
  const platformStripe = denyStripeCommercialForPlatformAdmin(payload);
  if (platformStripe) return platformStripe;

  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ error: "Informe sessionId (Checkout Session)." }, { status: 400 });
  }

  const result = await reconcileOrganizationFromStripeCheckoutSessionId(sessionId, payload.orgId);
  if (result.status === "synced") {
    return NextResponse.json({ synced: true });
  }
  if (result.status === "pending") {
    return NextResponse.json({ synced: false, pending: true, reason: result.reason });
  }
  return NextResponse.json({ error: result.reason }, { status: result.httpStatus });
}
