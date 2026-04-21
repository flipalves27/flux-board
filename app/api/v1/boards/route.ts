import { NextRequest, NextResponse } from "next/server";
import { listBoardsForOrgMongo } from "@/lib/anomaly-service";
import { isInnovationFlagEnabled } from "@/lib/feature-flags";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { resolveOrgFromV1ApiKey } from "@/lib/org-api-keys";

export const runtime = "nodejs";

/**
 * Enterprise Flux Insights API — listagem de boards da organização da chave.
 * Autenticação: header `x-api-key` (hash armazenado em `flux_org_api_keys`).
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  const resolved = await resolveOrgFromV1ApiKey(apiKey);
  if (!resolved) {
    return NextResponse.json({ error: "API key required or invalid" }, { status: 401 });
  }

  const org = await getOrganizationById(resolved.orgId);
  if (!isInnovationFlagEnabled("insights_api", org)) {
    return NextResponse.json({ error: "Flux Insights API requires Business tier and feature access." }, { status: 403 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const db = await getDb();
  const boards = await listBoardsForOrgMongo(resolved.orgId, db);

  return NextResponse.json({
    organizationId: resolved.orgId,
    boards: boards.map((b) => ({
      id: b.id,
      name: b.name,
      methodology: b.boardMethodology ?? null,
    })),
  });
}
