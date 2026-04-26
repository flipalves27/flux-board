import { NextRequest, NextResponse } from "next/server";
import { isMongoConfigured } from "@/lib/mongo";
import { listActiveForgeJobsForOrg } from "@/lib/kv-forge";
import { requireForgeAuth, assertForgeTierAllowed, jsonPlanGate } from "@/lib/forge-api-common";
import { planGateCtxFromAuthPayload } from "@/lib/plan-gates";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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

  if (!isMongoConfigured()) {
    return NextResponse.json({ active: [], persistence: false });
  }

  const active = await listActiveForgeJobsForOrg(ctx.payload.orgId);
  return NextResponse.json({ active, persistence: true });
}
