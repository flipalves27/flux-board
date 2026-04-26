import { NextResponse } from "next/server";
import { getIntegrationConnection } from "@/lib/kv-integrations";
import { requireForgeAuth, assertForgeTierAllowed, jsonPlanGate } from "@/lib/forge-api-common";
import { planGateCtxFromAuthPayload } from "@/lib/plan-gates";

export const runtime = "nodejs";

/** Lists GitHub connection metadata; full repo list would come from GitHub API with installation token. */
export async function GET(request: Request) {
  const ctx = await requireForgeAuth(request);
  if (ctx instanceof Response) return ctx;
  const gateCtx = planGateCtxFromAuthPayload(ctx.payload);
  try {
    assertForgeTierAllowed(ctx.org, "oneshot", gateCtx);
  } catch (e) {
    const j = jsonPlanGate(e);
    if (j) return j;
    throw e;
  }

  const conn = await getIntegrationConnection(ctx.payload.orgId, "github");
  return NextResponse.json({
    connected: conn?.status === "connected",
    installationId: conn?.installationId ?? null,
    accountLabel: conn?.accountLabel ?? null,
    externalOrgId: conn?.externalOrgId ?? null,
  });
}
