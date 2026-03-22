import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed } from "@/lib/plan-gates";
import { listTimeEntries, createTimeEntry, stopTimeEntry } from "@/lib/kv-time-entries";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; cardId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  try { assertFeatureAllowed(org, "time_tracking"); } catch {
    return NextResponse.json({ error: "Disponível em planos pagos." }, { status: 403 });
  }

  const entries = await listTimeEntries(payload.orgId, boardId, cardId);
  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  try { assertFeatureAllowed(org, "time_tracking"); } catch {
    return NextResponse.json({ error: "Disponível em planos pagos." }, { status: 403 });
  }

  let body: { action?: string; entryId?: string; subtaskId?: string; note?: string } = {};
  try { body = await request.json() as typeof body; } catch { /* ignore */ }

  if (body.action === "stop" && body.entryId) {
    const updated = await stopTimeEntry(payload.orgId, body.entryId, cardId);
    if (!updated) return NextResponse.json({ error: "Entrada não encontrada" }, { status: 404 });
    return NextResponse.json({ entry: updated });
  }

  const entry = await createTimeEntry({
    orgId: payload.orgId,
    boardId,
    cardId,
    userId: payload.id,
    subtaskId: body.subtaskId ?? null,
    note: body.note ?? "",
  });
  return NextResponse.json({ entry }, { status: 201 });
}
