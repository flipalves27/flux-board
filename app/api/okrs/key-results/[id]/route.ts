import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, PlanGateError } from "@/lib/plan-gates";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { deleteKeyResult, getKeyResult, updateKeyResult } from "@/lib/kv-okrs";
import { OkrsKeyResultUpdateSchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID do KR é obrigatório" }, { status: 400 });

  try {
    const org = await getOrganizationById(payload.orgId);
    try {
      assertFeatureAllowed(org, "okr_engine");
    } catch (err) {
      if (err instanceof PlanGateError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    const existing = await getKeyResult(payload.orgId, id);
    if (!existing) return NextResponse.json({ error: "Key Result não encontrado" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const parsed = OkrsKeyResultUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });

    const linkedBoardId = parsed.data.linkedBoardId ?? existing.linkedBoardId;
    const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, linkedBoardId);
    if (!canAccess) return NextResponse.json({ error: "Sem permissão para o board vinculado" }, { status: 403 });

    const metricType = parsed.data.metric_type ?? existing.metric_type;
    if (metricType === "card_in_column") {
      const board = await getBoard(linkedBoardId, payload.orgId);
      if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
      const bucketKeys = Array.isArray(board.config?.bucketOrder)
        ? board.config!.bucketOrder
            .map((b: any) => (b && typeof b === "object" ? b.key : null))
            .filter((k: any) => typeof k === "string" && k.trim())
            .map((k: any) => String(k))
        : [];
      const linkedColumnKey = sanitizeText(parsed.data.linkedColumnKey ?? existing.linkedColumnKey ?? "").trim();
      if (!bucketKeys.includes(linkedColumnKey)) {
        return NextResponse.json(
          { error: "linkedColumnKey não existe no board informado (bucket key)." },
          { status: 400 }
        );
      }
    }

    const kr = await updateKeyResult(payload.orgId, id, parsed.data);
    if (!kr) return NextResponse.json({ error: "Key Result não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, keyResult: kr });
  } catch (err) {
    console.error("OKRs key-result PATCH error:", err);
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
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID do KR é obrigatório" }, { status: 400 });

  try {
    const org = await getOrganizationById(payload.orgId);
    try {
      assertFeatureAllowed(org, "okr_engine");
    } catch (err) {
      if (err instanceof PlanGateError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    const existing = await getKeyResult(payload.orgId, id);
    if (!existing) return NextResponse.json({ error: "Key Result não encontrado" }, { status: 404 });
    await deleteKeyResult(payload.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("OKRs key-result DELETE error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}

