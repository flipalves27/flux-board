import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
} from "@/lib/plan-gates";
import type { RetroFormat } from "@/lib/ceremony-retrospective";
import { getSprint } from "@/lib/kv-sprints";
import { generateRetrospective } from "@/lib/ceremony-retrospective";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sprintId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, sprintId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try { assertFeatureAllowed(org, "ceremonies", gateCtx); } catch {
    return NextResponse.json({ error: "Disponível no plano Business." }, { status: 403 });
  }

  const dailyCap = getDailyAiCallsCap(org, gateCtx);
  if (dailyCap !== null) {
    const rl = await rateLimit({ key: makeDailyAiCallsRateLimitKey(payload.orgId), limit: dailyCap, windowMs: getDailyAiCallsWindowMs() });
    if (!rl.allowed) return NextResponse.json({ error: "Limite diário de chamadas IA atingido." }, { status: 429 });
  }

  const sprint = await getSprint(payload.orgId, sprintId);
  if (!sprint || sprint.boardId !== boardId) return NextResponse.json({ error: "Sprint não encontrado" }, { status: 404 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  let format: RetroFormat = "classic";
  try {
    const body = (await request.json()) as { format?: string };
    if (body?.format === "start-stop-continue" || body?.format === "4ls" || body?.format === "classic") {
      format = body.format;
    }
  } catch {
    // body opcional
  }

  const retro = await generateRetrospective({
    sprint,
    board,
    org,
    format,
    userId: payload.id,
    isAdmin: Boolean(payload.isAdmin),
  });
  return NextResponse.json({ retro });
}
