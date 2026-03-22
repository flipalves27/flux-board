import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, getDailyAiCallsCap, getDailyAiCallsWindowMs, makeDailyAiCallsRateLimitKey } from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import { generateWorkloadBalance } from "@/lib/ai-workload-balancer";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  try { assertFeatureAllowed(org, "workload_balancer"); } catch {
    return NextResponse.json({ error: "Disponível em planos Business ou Enterprise." }, { status: 403 });
  }

  const dailyCap = getDailyAiCallsCap(org);
  if (dailyCap !== null) {
    const rl = await rateLimit({ key: makeDailyAiCallsRateLimitKey(payload.orgId), limit: dailyCap, windowMs: getDailyAiCallsWindowMs() });
    if (!rl.allowed) return NextResponse.json({ error: "Limite diário de chamadas IA atingido." }, { status: 429 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const result = await generateWorkloadBalance({ board, org });
  return NextResponse.json({ workloadBalance: result });
}
