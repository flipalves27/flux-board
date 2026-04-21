import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { isMongoConfigured } from "@/lib/mongo";
import { listActiveSpecPlanRunsForUser } from "@/lib/spec-plan-runs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const org = await getOrganizationById(payload.orgId);
  if (!org) {
    return NextResponse.json({ error: "Org não encontrada" }, { status: 404 });
  }

  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "spec_ai_scope_planner", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json(
        { error: err.message, code: err.code, active: [] },
        { status: err.status }
      );
    }
    throw err;
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({ active: [], persistence: false });
  }

  const active = await listActiveSpecPlanRunsForUser(payload.orgId, payload.id);
  return NextResponse.json({ active, persistence: true });
}
