import { NextRequest, NextResponse } from "next/server";
import { ensureSpecPlanAccess } from "@/lib/spec-plan-access";
import { isMongoConfigured } from "@/lib/mongo";
import { getSpecPlanRun, updateSpecPlanRun } from "@/lib/spec-plan-runs";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";

export async function POST(
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

  if (doc.status !== "running" && doc.status !== "queued") {
    return NextResponse.json({ error: "Esta execução já terminou." }, { status: 400 });
  }

  if (!ObjectId.isValid(runId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const ok = await updateSpecPlanRun(new ObjectId(runId), access.payload.orgId, {
    cancelRequested: true,
  });
  if (!ok) {
    return NextResponse.json({ error: "Não foi possível cancelar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
