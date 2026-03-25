import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth } from "@/lib/plan-gates";
import { SubtaskSchema, computeSubtaskProgress, sanitizeDeep } from "@/lib/schemas";
import { z } from "zod";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; cardId: string }> };

const PatchBodySchema = z.object({
  subtasks: z.array(SubtaskSchema).max(50),
});

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin);
  try {
    assertFeatureAllowed(org, "subtasks", gateCtx);
  } catch {
    return NextResponse.json({ error: "Disponível em planos pagos." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  const cards = Array.isArray(board.cards) ? [...board.cards] : [];
  const cardIndex = cards.findIndex(
    (c) => (c as Record<string, unknown>).id === cardId
  );
  if (cardIndex < 0) {
    return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });
  }

  const sanitized = sanitizeDeep(parsed.data.subtasks);
  const subtaskProgress = computeSubtaskProgress(sanitized);
  const updatedCard = {
    ...(cards[cardIndex] as Record<string, unknown>),
    subtasks: sanitized,
    subtaskProgress,
  };
  cards[cardIndex] = updatedCard;

  const updated = await updateBoard(boardId, payload.orgId, { cards }, {
    userId: payload.id,
    userName: payload.username,
    orgId: payload.orgId,
  });

  if (!updated) {
    return NextResponse.json({ error: "Falha ao salvar board" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    subtasks: sanitized,
    subtaskProgress,
  });
}
