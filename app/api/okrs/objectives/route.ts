import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth, PlanGateError } from "@/lib/plan-gates";
import { listObjectives, createObjective } from "@/lib/kv-okrs";
import { OkrsObjectiveCreateSchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxForAuth(payload.isAdmin);
    try {
      assertFeatureAllowed(org, "okr_engine", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    const quarter = request.nextUrl.searchParams.get("quarter");
    const objectives = await listObjectives(payload.orgId, quarter || null);
    return NextResponse.json({
      ok: true,
      quarter: quarter || null,
      objectives,
    });
  } catch (err) {
    console.error("OKRs objectives GET error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const org = await getOrganizationById(payload.orgId);
    const gateCtxPost = planGateCtxForAuth(payload.isAdmin);
    try {
      assertFeatureAllowed(org, "okr_engine", gateCtxPost);
    } catch (err) {
      if (err instanceof PlanGateError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    const body = await request.json().catch(() => ({}));
    const parsed = OkrsObjectiveCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const objective = await createObjective({
      orgId: payload.orgId,
      ownerId: parsed.data.owner ? sanitizeText(parsed.data.owner).trim().slice(0, 200) : payload.username,
      title: parsed.data.title,
      quarter: parsed.data.quarter,
    });

    return NextResponse.json({ ok: true, objective }, { status: 201 });
  } catch (err) {
    console.error("OKRs objective POST error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}

