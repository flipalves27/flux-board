import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { createKeyResult, getObjective } from "@/lib/kv-okrs";
import { OkrsKeyResultCreateSchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxFromAuthPayload(payload);
    try {
      assertFeatureAllowed(org, "okr_engine", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }

    const body = await request.json().catch(() => ({}));
    const parsed = OkrsKeyResultCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });

    const objective = await getObjective(payload.orgId, parsed.data.objectiveId);
    if (!objective) return NextResponse.json({ error: "objectiveId não encontrado" }, { status: 404 });

    const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, parsed.data.linkedBoardId);
    if (!canAccess) return NextResponse.json({ error: "Sem permissão para o board vinculado" }, { status: 403 });

    if (parsed.data.metric_type === "card_in_column") {
      const board = await getBoard(parsed.data.linkedBoardId, payload.orgId);
      if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

      const bucketKeys = Array.isArray(board.config?.bucketOrder)
        ? board.config!.bucketOrder
            .map((b: any) => (b && typeof b === "object" ? b.key : null))
            .filter((k: any) => typeof k === "string" && k.trim())
            .map((k: any) => String(k))
        : [];

      const linkedColumnKey = sanitizeText(parsed.data.linkedColumnKey ?? "").trim();
      if (!bucketKeys.includes(linkedColumnKey)) {
        return NextResponse.json(
          { error: "linkedColumnKey não existe no board informado (bucket key)." },
          { status: 400 }
        );
      }
    }

    const kr = await createKeyResult({
      orgId: payload.orgId,
      objectiveId: parsed.data.objectiveId,
      title: parsed.data.title,
      metric_type: parsed.data.metric_type,
      target: parsed.data.target as number,
      linkedBoardId: parsed.data.linkedBoardId,
      linkedColumnKey: parsed.data.linkedColumnKey ?? null,
      manualCurrent: parsed.data.manualCurrent ?? null,
    });

    return NextResponse.json({ ok: true, keyResult: kr }, { status: 201 });
  } catch (err) {
    console.error("OKRs key-results POST error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}

