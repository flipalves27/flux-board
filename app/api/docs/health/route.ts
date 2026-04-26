import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { computeDocumentHealthReport } from "@/lib/docs-health";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature, planGateCtxFromAuthPayload } from "@/lib/plan-gates";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const org = await getOrganizationById(payload.orgId);
  if (!canUseFeature(org, "flux_docs", planGateCtxFromAuthPayload(payload)))
    return NextResponse.json({ error: "Flux Docs indisponível." }, { status: 403 });

  const daysRaw = request.nextUrl.searchParams.get("staleDays");
  const staleDays = daysRaw != null && daysRaw !== "" ? Number.parseInt(daysRaw, 10) : undefined;
  const report = await computeDocumentHealthReport(payload.orgId, { staleDays: Number.isFinite(staleDays) ? staleDays : undefined });
  return NextResponse.json({ report });
}
