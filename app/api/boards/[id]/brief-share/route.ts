import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { rateLimit } from "@/lib/rate-limit";
import { createBriefPortalToken } from "@/lib/brief-portal-token";
import { assertOnda4Enabled } from "@/lib/onda4-flags";
import { publicApiErrorResponse } from "@/lib/public-api-error";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const org = await getOrganizationById(payload.orgId);
  try {
    assertOnda4Enabled(org);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Portal de brief indisponível." }, { status });
  }

  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "executive_brief", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    throw err;
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const rl = await rateLimit({
    key: `brief-share:${payload.orgId}`,
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Limite de uso." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const markdown = typeof body?.markdown === "string" ? body.markdown.trim().slice(0, 120_000) : "";
  if (!markdown) return NextResponse.json({ error: "markdown obrigatório" }, { status: 400 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const token = await createBriefPortalToken({
    orgId: payload.orgId,
    boardId,
    title: board.name ?? "Board",
    markdown,
    ttlDays: 7,
  });
  if (!token) {
    return NextResponse.json({ error: "Armazenamento não configurado." }, { status: 503 });
  }

  return NextResponse.json({ token, path: `/portal/brief/${token}` });
}
