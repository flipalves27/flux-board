import { NextRequest, NextResponse } from "next/server";
import { ensureSpecPlanAccess } from "@/lib/spec-plan-access";
import { serializeSpecPlanRunFull } from "@/lib/spec-plan-run-serialize";
import { isMongoConfigured } from "@/lib/mongo";
import { deleteSpecPlanRun, getSpecPlanRun } from "@/lib/spec-plan-runs";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { id: boardId, runId } = await params;
  const access = await ensureSpecPlanAccess(request, boardId);
  if (access instanceof Response) return access;

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "MongoDB não configurado." }, { status: 503 });
  }

  const doc = await getSpecPlanRun(runId, access.payload.orgId);
  if (!doc || doc.boardId !== boardId) {
    return NextResponse.json({ error: "Execução não encontrada." }, { status: 404 });
  }
  if (doc.userId !== access.payload.id && !access.payload.isAdmin) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  return NextResponse.json({ run: serializeSpecPlanRunFull(doc) });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { id: boardId, runId } = await params;
  const access = await ensureSpecPlanAccess(request, boardId);
  if (access instanceof Response) return access;

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "MongoDB não configurado." }, { status: 503 });
  }

  const doc = await getSpecPlanRun(runId, access.payload.orgId);
  if (!doc || doc.boardId !== boardId) {
    return NextResponse.json({ error: "Execução não encontrada." }, { status: 404 });
  }
  if (doc.userId !== access.payload.id && !access.payload.isAdmin) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const ok = await deleteSpecPlanRun(runId, access.payload.orgId, doc.userId);
  if (!ok) {
    return NextResponse.json({ error: "Não foi possível excluir." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
