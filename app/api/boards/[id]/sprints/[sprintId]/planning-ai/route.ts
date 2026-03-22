import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, getDailyAiCallsCap, getDailyAiCallsWindowMs, makeDailyAiCallsRateLimitKey } from "@/lib/plan-gates";
import { getSprint } from "@/lib/kv-sprints";
import { buildSprintPredictionPayload } from "@/lib/sprint-prediction-metrics";
import { buildSprintPlanningAiSuggestion } from "@/lib/sprint-planning-ai";
import { buildRollingWeekRanges, buildWeeklyThroughputFromCopilot } from "@/lib/flux-reports-metrics";
import { rateLimit } from "@/lib/rate-limit";
import { getBoardCopilotChat } from "@/lib/kv-board-copilot";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sprintId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, sprintId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  try { assertFeatureAllowed(org, "sprint_engine"); } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const dailyCap = getDailyAiCallsCap(org);
  if (dailyCap !== null) {
    const rl = await rateLimit({ key: makeDailyAiCallsRateLimitKey(payload.orgId), limit: dailyCap, windowMs: getDailyAiCallsWindowMs() });
    if (!rl.allowed) return NextResponse.json({ error: "Limite diário de chamadas IA atingido." }, { status: 429 });
  }

  const sprint = await getSprint(payload.orgId, sprintId);
  if (!sprint || sprint.boardId !== boardId) return NextResponse.json({ error: "Sprint não encontrado" }, { status: 404 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  let horizonDays = 14;
  if (sprint.startDate && sprint.endDate) {
    const s = new Date(sprint.startDate + "T00:00:00");
    const e = new Date(sprint.endDate + "T00:00:00");
    const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
    if (diff > 0) horizonDays = diff;
  }

  const NUM_WEEKS = 12;
  const nowMs = Date.now();
  const weeks = buildRollingWeekRanges(NUM_WEEKS, nowMs);
  const copilotChat = await getBoardCopilotChat(payload.orgId, boardId);
  const weeklyThroughput = buildWeeklyThroughputFromCopilot(copilotChat ? [copilotChat] : [], [boardId], weeks);

  const prediction = buildSprintPredictionPayload({
    boards: [board],
    weeks,
    weeklyThroughput,
    horizonDays,
  });

  const suggestion = await buildSprintPlanningAiSuggestion({ sprint, board, prediction, org });
  return NextResponse.json({ prediction, suggestion });
}
