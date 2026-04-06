import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { deleteKeyResult, getKeyResult, updateKeyResult } from "@/lib/kv-okrs";
import { OkrsKeyResultUpdateSchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";
import { enqueueWebhookDeliveriesForEvent } from "@/lib/webhook-delivery";
import { publicApiErrorResponse } from "@/lib/public-api-error";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID do KR é obrigatório" }, { status: 400 });

  try {
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxFromAuthPayload(payload);
    try {
      assertFeatureAllowed(org, "okr_engine", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
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

    const progressRelevant =
      existing.manualCurrent !== kr.manualCurrent ||
      existing.target !== kr.target ||
      existing.metric_type !== kr.metric_type ||
      existing.linkedBoardId !== kr.linkedBoardId ||
      existing.linkedColumnKey !== kr.linkedColumnKey;
    if (progressRelevant) {
      void enqueueWebhookDeliveriesForEvent(payload.orgId, "okr.progress_changed", {
        key_result_id: kr.id,
        objective_id: kr.objectiveId,
        title: kr.title,
        metric_type: kr.metric_type,
        target: kr.target,
        manual_current: kr.manualCurrent,
        linked_board_id: kr.linkedBoardId,
        linked_column_key: kr.linkedColumnKey,
      });
    }

    return NextResponse.json({ ok: true, keyResult: kr });
  } catch (err) {
    console.error("OKRs key-result PATCH error:", err);
    return publicApiErrorResponse(err, { context: "api/okrs/key-results/[id]/route.ts" });
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
  if (!id) return NextResponse.json({ error: "ID do KR é obrigatório" }, { status: 400 });

  try {
    const org = await getOrganizationById(payload.orgId);
    const gateCtxDel = planGateCtxFromAuthPayload(payload);
    try {
      assertFeatureAllowed(org, "okr_engine", gateCtxDel);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }

    const existing = await getKeyResult(payload.orgId, id);
    if (!existing) return NextResponse.json({ error: "Key Result não encontrado" }, { status: 404 });
    await deleteKeyResult(payload.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("OKRs key-result DELETE error:", err);
    return publicApiErrorResponse(err, { context: "api/okrs/key-results/[id]/route.ts" });
  }
}

