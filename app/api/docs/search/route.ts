import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { searchDocs } from "@/lib/kv-docs";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature, planGateCtxForAuth } from "@/lib/plan-gates";
import { logDocsMetric } from "@/lib/docs-metrics";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const org = await getOrganizationById(payload.orgId);
  if (!canUseFeature(org, "flux_docs", planGateCtxForAuth(payload.isAdmin)))
    return NextResponse.json({ error: "Flux Docs indisponível." }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q") || "";
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "20", 10);
  const started = Date.now();
  const docs = await searchDocs(payload.orgId, q, Number.isFinite(limit) ? limit : 20);
  logDocsMetric("docs.search", { orgId: payload.orgId, queryLen: q.length, resultCount: docs.length, latencyMs: Date.now() - started });
  return NextResponse.json({ docs });
}
