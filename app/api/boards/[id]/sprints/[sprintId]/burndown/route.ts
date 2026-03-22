import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth } from "@/lib/plan-gates";
import { getSprint } from "@/lib/kv-sprints";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sprintId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, sprintId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin);
  try { assertFeatureAllowed(org, "sprint_engine", gateCtx); } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const sprint = await getSprint(payload.orgId, sprintId);
  if (!sprint || sprint.boardId !== boardId) return NextResponse.json({ error: "Sprint não encontrado" }, { status: 404 });

  const board = await getBoard(boardId, payload.orgId);
  const cards = Array.isArray(board?.cards) ? (board!.cards as Array<Record<string, unknown>>) : [];
  const sprintCards = sprint.cardIds.map((cid) => cards.find((c) => c.id === cid)).filter(Boolean) as Array<Record<string, unknown>>;

  const startDate = sprint.startDate ? new Date(sprint.startDate + "T00:00:00") : null;
  const endDate = sprint.endDate ? new Date(sprint.endDate + "T00:00:00") : null;

  if (!startDate || !endDate) {
    return NextResponse.json({ burndown: null, message: "Sprint sem datas definidas." });
  }

  const total = sprintCards.length;
  const dayMs = 86400000;
  const days: Array<{ date: string; ideal: number; actual: number }> = [];
  const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / dayMs));

  for (let d = 0; d <= durationDays; d++) {
    const dayTs = startDate.getTime() + d * dayMs;
    const dateStr = new Date(dayTs).toISOString().slice(0, 10);
    const ideal = Math.max(0, total - (total / durationDays) * d);
    const doneByDay = sprintCards.filter((c) => {
      const completedAt = typeof c.completedAt === "string" ? c.completedAt : null;
      if (!completedAt) return false;
      return new Date(completedAt).getTime() <= dayTs + dayMs;
    }).length;
    days.push({ date: dateStr, ideal: Math.round(ideal * 10) / 10, actual: total - doneByDay });
  }

  const snapByDate = new Map(sprint.burndownSnapshots.map((s) => [s.date, s]));
  for (const day of days) {
    const snap = snapByDate.get(day.date);
    if (snap) {
      day.actual = snap.remainingCards;
      day.ideal = Math.round(snap.idealRemaining * 10) / 10;
    }
  }

  return NextResponse.json({
    burndown: { sprintId, total, startDate: sprint.startDate, endDate: sprint.endDate, days },
  });
}
