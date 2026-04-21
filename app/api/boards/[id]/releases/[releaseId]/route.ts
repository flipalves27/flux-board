import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { deleteRelease, getRelease, updateRelease } from "@/lib/kv-releases";
import { ReleaseUpdateSchema, zodErrorToMessage } from "@/lib/schemas";

export const runtime = "nodejs";

async function guard(request: NextRequest, boardId: string) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  const org = await getOrganizationById(payload.orgId);
  try {
    assertFeatureAllowed(org, "sprint_engine", planGateCtxFromAuthPayload(payload));
  } catch {
    return { error: NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 }) };
  }
  return { payload };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  const { id: boardId, releaseId } = await params;
  const gate = await guard(request, boardId);
  if ("error" in gate) return gate.error;
  const release = await getRelease(gate.payload.orgId, releaseId);
  if (!release || release.boardId !== boardId) {
    return NextResponse.json({ error: "Release não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ release });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  const { id: boardId, releaseId } = await params;
  const gate = await guard(request, boardId);
  if ("error" in gate) return gate.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ReleaseUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });

  const existing = await getRelease(gate.payload.orgId, releaseId);
  if (!existing || existing.boardId !== boardId) {
    return NextResponse.json({ error: "Release não encontrada" }, { status: 404 });
  }
  const updated = await updateRelease(gate.payload.orgId, releaseId, parsed.data, { actor: gate.payload.id });
  return NextResponse.json({ release: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  const { id: boardId, releaseId } = await params;
  const gate = await guard(request, boardId);
  if ("error" in gate) return gate.error;
  const existing = await getRelease(gate.payload.orgId, releaseId);
  if (!existing || existing.boardId !== boardId) {
    return NextResponse.json({ error: "Release não encontrada" }, { status: 404 });
  }
  const ok = await deleteRelease(gate.payload.orgId, boardId, releaseId);
  return NextResponse.json({ ok });
}
