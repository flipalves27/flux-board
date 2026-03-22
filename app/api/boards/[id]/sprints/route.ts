import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth } from "@/lib/plan-gates";
import { listSprints, createSprint } from "@/lib/kv-sprints";
import { SprintCreateSchema, sanitizeText } from "@/lib/schemas";
import { zodErrorToMessage } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtxGet = planGateCtxForAuth(payload.isAdmin);
  try { assertFeatureAllowed(org, "sprint_engine", gateCtxGet); } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const sprints = await listSprints(payload.orgId, boardId);
  return NextResponse.json({ sprints });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtxPost = planGateCtxForAuth(payload.isAdmin);
  try { assertFeatureAllowed(org, "sprint_engine", gateCtxPost); } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = SprintCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });

  const { name, goal, startDate, endDate, cardIds } = parsed.data;
  const sprint = await createSprint({
    orgId: payload.orgId,
    boardId,
    name,
    goal,
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    cardIds: cardIds ?? [],
  });

  return NextResponse.json({ sprint }, { status: 201 });
}
