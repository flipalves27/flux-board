import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  planGateCtxForAuth,
  PlanGateError,
} from "@/lib/plan-gates";
import {
  runMonteCarloSimulation,
  computeCardRiskScore,
  computeThroughputForecast,
  computeScopeCreepRatio,
  deriveSprintHealth,
  type DeliveryForecastResult,
} from "@/lib/predictive-delivery";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin, payload.isExecutive);
  try {
    assertFeatureAllowed(org, "risk_score", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const cards = Array.isArray(board.cards) ? board.cards : [];
  const now = Date.now();

  const incompleteCards = cards.filter((raw) => {
    const c = raw as Record<string, unknown>;
    return String(c.progress || "") !== "Concluída";
  });
  const completedCards = cards.filter((raw) => {
    const c = raw as Record<string, unknown>;
    return String(c.progress || "") === "Concluída";
  });

  const completedByDay = new Map<string, number>();
  for (const card of completedCards) {
    const c = card as Record<string, unknown>;
    const completedAt = c.completedAt ?? c.columnEnteredAt;
    if (typeof completedAt === "string") {
      const dayKey = completedAt.slice(0, 10);
      completedByDay.set(dayKey, (completedByDay.get(dayKey) || 0) + 1);
    }
  }

  const last30Days: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    last30Days.push(completedByDay.get(key) || 0);
  }

  const weeklyThroughput: number[] = [];
  for (let w = 0; w < Math.min(8, Math.floor(last30Days.length / 7)); w++) {
    const weekSlice = last30Days.slice(w * 7, (w + 1) * 7);
    weeklyThroughput.push(weekSlice.reduce((a, b) => a + b, 0));
  }

  const monteCarlo = runMonteCarloSimulation(incompleteCards.length, last30Days);

  const riskCards = incompleteCards
    .map((raw) => {
      const c = raw as Record<string, unknown>;
      return computeCardRiskScore({
        id: String(c.id || ""),
        title: String(c.title || ""),
        createdAt: typeof c.columnEnteredAt === "string" ? c.columnEnteredAt : null,
        lastActivityAt: typeof c.columnEnteredAt === "string" ? c.columnEnteredAt : null,
        blockedBy: Array.isArray(c.blockedBy) ? c.blockedBy.filter((x: unknown) => typeof x === "string") : [],
        dependencyCount: Array.isArray(c.blockedBy) ? c.blockedBy.length : 0,
        progress: String(c.progress || ""),
        dueDate: typeof c.dueDate === "string" ? c.dueDate : null,
      });
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const throughputForecast = computeThroughputForecast(weeklyThroughput, 4);

  const scopeCreepRatio = computeScopeCreepRatio(
    incompleteCards.length + completedCards.length,
    0
  );

  const avgRisk = riskCards.length > 0
    ? riskCards.reduce((a, r) => a + r.score, 0) / riskCards.length
    : 0;

  const sprintHealthLabel = deriveSprintHealth(scopeCreepRatio, avgRisk, monteCarlo, 14);

  const result: DeliveryForecastResult = {
    monteCarlo,
    riskCards,
    throughputForecast,
    scopeCreepRatio,
    sprintHealthLabel,
  };

  return NextResponse.json({ ok: true, ...result });
}
