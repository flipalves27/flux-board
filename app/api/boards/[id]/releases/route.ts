import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { createRelease, listReleases } from "@/lib/kv-releases";
import { ReleaseCreateSchema, zodErrorToMessage } from "@/lib/schemas";

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: boardId } = await params;
  const gate = await guard(request, boardId);
  if ("error" in gate) return gate.error;
  const releases = await listReleases(gate.payload.orgId, boardId);
  return NextResponse.json({ releases });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: boardId } = await params;
  const gate = await guard(request, boardId);
  if ("error" in gate) return gate.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ReleaseCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });

  const release = await createRelease({
    orgId: gate.payload.orgId,
    boardId,
    createdBy: gate.payload.id,
    input: parsed.data,
  });
  return NextResponse.json({ release }, { status: 201 });
}
