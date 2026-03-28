import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser, getUserById } from "@/lib/kv-users";
import { listBoardsForUser, type BoardData } from "@/lib/kv-boards";
import { boardsToPortfolioRows, aggregatePortfolio } from "@/lib/portfolio-export-core";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, canUseFeature, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import {
  buildRollingWeekRanges,
  buildWeeklyThroughputFromCopilot,
  type CopilotChatDocLike,
} from "@/lib/flux-reports-metrics";
import { listObjectivesWithKeyResults, type OkrsKeyResult, type OkrsObjective } from "@/lib/kv-okrs";
import {
  computeObjectiveProgressForOrg,
  type OkrsObjectiveDefinition,
  type OkrsKeyResultDefinition,
} from "@/lib/okr-engine";
import {
  averageNullable,
  computeBoardWipComplianceScore,
  type PortfolioBoardLike,
} from "@/lib/board-portfolio-metrics";
import { computePortfolioHealthScore } from "@/lib/executive-dashboard-metrics";
import { currentQuarterLabel } from "@/lib/quarter-label";
import { COL_ANOMALY_ALERTS } from "@/lib/anomaly-service";
import { buildLeanSixSigmaPortfolioSummary } from "@/lib/flux-reports-lss";

const NUM_WEEKS = 8;

function toObjectiveDefinition(objective: OkrsObjective, keyResults: OkrsKeyResult[]): OkrsObjectiveDefinition {
  const krs: OkrsKeyResultDefinition[] = keyResults.map((kr) => ({
    id: kr.id,
    objectiveId: kr.objectiveId,
    title: kr.title,
    metric_type: kr.metric_type,
    target: kr.target,
    linkedBoardId: kr.linkedBoardId,
    linkedColumnKey: kr.linkedColumnKey,
    manualCurrent: kr.manualCurrent,
  }));
  return {
    id: objective.id,
    title: objective.title,
    owner: objective.owner,
    quarter: objective.quarter,
    keyResults: krs,
  };
}

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const actor = await getUserById(payload.id, payload.orgId);
    if (!actor) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!actor.isAdmin && !actor.isExecutive) {
      return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
    }

    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxFromAuthPayload(payload);
    try {
      assertFeatureAllowed(org, "portfolio_export", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }

    const boards = await listBoardsForUser(
      payload.id,
      payload.orgId,
      payload.isAdmin || !!actor.isExecutive
    );
    const rows = boardsToPortfolioRows(boards);
    const aggregates = aggregatePortfolio(rows);

    const boardById = new Map<string, BoardData>(boards.map((b) => [b.id, b]));

    const wipScores = boards.map((b) => computeBoardWipComplianceScore(b as PortfolioBoardLike));
    const avgWipCompliance = averageNullable(wipScores);

    const quarter = currentQuarterLabel();
    let okrRings: Array<{ id: string; title: string; progressPct: number; quarter: string }> = [];
    let okrAvgPct: number | null = null;
    const okrEnabled = canUseFeature(org, "okr_engine", gateCtx);

    if (okrEnabled) {
      const grouped = await listObjectivesWithKeyResults(payload.orgId, quarter);
      const computed = grouped.map(({ objective, keyResults }) => {
        const def = toObjectiveDefinition(objective, keyResults);
        const boardsById = new Map<string, PortfolioBoardLike>();
        for (const kr of keyResults) {
          const b = boardById.get(kr.linkedBoardId);
          if (b) boardsById.set(kr.linkedBoardId, b as PortfolioBoardLike);
        }
        return computeObjectiveProgressForOrg({ objective: def, boardsById });
      });
      okrRings = computed.map((c) => ({
        id: c.objective.id,
        title: c.objective.title,
        progressPct: c.objectiveCurrentPct,
        quarter: c.objective.quarter,
      }));
      if (computed.length) {
        okrAvgPct = Math.round(
          computed.reduce((acc, c) => acc + c.objectiveCurrentPct, 0) / computed.length
        );
      }
    }

    const health = computePortfolioHealthScore({
      avgThroughput: aggregates.avgThroughput,
      avgRisco: aggregates.avgRisco,
      avgPrevisibilidade: aggregates.avgPrevisibilidade,
      avgWipCompliance,
      okrAvgPct,
      okrAvailable: okrEnabled && okrRings.length > 0,
    });

    const topRiskBoards = [...rows]
      .filter((r) => r.portfolio.cardCount > 0 && r.portfolio.risco != null)
      .sort((a, b) => (a.portfolio.risco ?? 100) - (b.portfolio.risco ?? 100))
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        name: r.name,
        clientLabel: r.clientLabel ?? null,
        risco: r.portfolio.risco,
        throughput: r.portfolio.throughput,
        previsibilidade: r.portfolio.previsibilidade,
        cardCount: r.portfolio.cardCount,
      }));

    const portfolioBoards = [...rows]
      .filter((r) => r.portfolio.cardCount > 0)
      .sort((a, b) => (a.portfolio.risco ?? 100) - (b.portfolio.risco ?? 100))
      .map((r) => ({
        id: r.id,
        name: r.name,
        clientLabel: r.clientLabel ?? null,
        risco: r.portfolio.risco,
        throughput: r.portfolio.throughput,
        previsibilidade: r.portfolio.previsibilidade,
        cardCount: r.portfolio.cardCount,
      }));

    const nowMs = Date.now();
    const weeks = buildRollingWeekRanges(NUM_WEEKS, nowMs);
    const boardIds = boards.map((b) => b.id).filter(Boolean);

    let copilotChats: CopilotChatDocLike[] = [];
    if (isMongoConfigured() && boardIds.length) {
      const db = await getDb();
      const oldestStart = weeks[0]?.startMs ?? nowMs - NUM_WEEKS * 7 * 24 * 60 * 60 * 1000;
      const prevStartIso = new Date(oldestStart).toISOString();
      copilotChats = (await db
        .collection("board_copilot_chats")
        .find({ orgId: payload.orgId, boardId: { $in: boardIds }, updatedAt: { $gte: prevStartIso } })
        .toArray()) as CopilotChatDocLike[];
    }

    const weeklyThroughput = buildWeeklyThroughputFromCopilot(copilotChats, boardIds, weeks);
    const throughputTrend = weeklyThroughput.slice(-NUM_WEEKS).map((w) => ({
      weekLabel: w.weekLabel,
      concluded: w.concluded,
    }));

    let anomalies: Array<{
      id: string;
      severity: string;
      title: string;
      message: string;
      boardName?: string;
      suggestedAction?: string;
      suggestedActionModel?: string;
      suggestedActionProvider?: string;
      createdAt: string;
      read: boolean;
    }> = [];

    if (isMongoConfigured()) {
      const db = await getDb();
      const raw = await db
        .collection(COL_ANOMALY_ALERTS)
        .find({ orgId: payload.orgId })
        .sort({ createdAt: -1 })
        .limit(24)
        .toArray();

      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      anomalies = raw
        .filter((a) => {
          const unread = !Boolean(a.read);
          const t = new Date(String(a.createdAt || 0)).getTime();
          return unread || (Number.isFinite(t) && t >= cutoff);
        })
        .slice(0, 12)
        .map((a) => ({
          id: a._id instanceof ObjectId ? a._id.toHexString() : String(a._id),
          severity: String(a.severity ?? "info"),
          title: String(a.title ?? ""),
          message: String(a.message ?? ""),
          boardName: typeof a.boardName === "string" ? a.boardName : undefined,
          suggestedAction:
            typeof (a as { suggestedAction?: unknown }).suggestedAction === "string"
              ? String((a as unknown as { suggestedAction: string }).suggestedAction)
              : undefined,
          suggestedActionModel:
            typeof (a as { suggestedActionModel?: unknown }).suggestedActionModel === "string"
              ? String((a as unknown as { suggestedActionModel: string }).suggestedActionModel)
              : undefined,
          suggestedActionProvider:
            typeof (a as { suggestedActionProvider?: unknown }).suggestedActionProvider === "string"
              ? String((a as unknown as { suggestedActionProvider: string }).suggestedActionProvider)
              : undefined,
          createdAt: String(a.createdAt ?? ""),
          read: Boolean(a.read),
        }));
    }

    const generatedAt = new Date().toISOString();

    const lssReportsEnabled = canUseFeature(org, "lss_executive_reports", gateCtx);
    const leanSixSigmaPortfolio = lssReportsEnabled ? buildLeanSixSigmaPortfolioSummary(boards) : null;

    return NextResponse.json(
      {
      schema: "flux-board.executive_dashboard.v1",
      generatedAt,
      quarter,
      health: {
        score: health.score,
        breakdown: health.breakdown,
      },
      aggregates: {
        boardCount: aggregates.boardCount,
        boardsWithCards: aggregates.boardsWithCards,
        avgRisco: aggregates.avgRisco,
        avgThroughput: aggregates.avgThroughput,
        avgPrevisibilidade: aggregates.avgPrevisibilidade,
        atRiskCount: aggregates.atRiskCount,
        avgWipCompliance,
      },
      okrs: {
        enabled: okrEnabled,
        rings: okrRings,
        avgProgressPct: okrAvgPct,
      },
      throughputTrend,
      topRiskBoards,
      portfolioBoards,
      anomalies,
      meta: {
        boardCount: boards.length,
        copilotHistory: copilotChats.length > 0,
      },
      leanSixSigmaPortfolio,
    },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=120",
        },
      }
    );
  } catch (err) {
    console.error("Executive dashboard API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
