import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth, PlanGateError } from "@/lib/plan-gates";
import { deleteObjective, getObjective, updateObjective } from "@/lib/kv-okrs";
import { OkrsObjectiveUpdateSchema, zodErrorToMessage } from "@/lib/schemas";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID da objective é obrigatório" }, { status: 400 });

  try {
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxForAuth(payload.isAdmin);
    try {
      assertFeatureAllowed(org, "okr_engine", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    const body = await request.json().catch(() => ({}));
    const parsed = OkrsObjectiveUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });

    const objective = await updateObjective(payload.orgId, id, parsed.data);
    if (!objective) return NextResponse.json({ error: "Objective não encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true, objective });
  } catch (err) {
    console.error("OKRs objective PATCH error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PATCH(request, context);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID da objective é obrigatório" }, { status: 400 });

  try {
    const org = await getOrganizationById(payload.orgId);
    const gateCtxDel = planGateCtxForAuth(payload.isAdmin);
    try {
      assertFeatureAllowed(org, "okr_engine", gateCtxDel);
    } catch (err) {
      if (err instanceof PlanGateError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    const existing = await getObjective(payload.orgId, id);
    if (!existing) return NextResponse.json({ error: "Objective não encontrada" }, { status: 404 });
    await deleteObjective(payload.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("OKRs objective DELETE error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}

