import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { getBoardIds, getBoardsFluxReportsSliceByIds } from "@/lib/kv-boards";
import { aggregatePortfolio, boardsToPortfolioRows } from "@/lib/portfolio-export-core";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import {
  averageApproxCycleTimeDays,
  averageLeadTimeDays,
  buildBlockerTagDistribution,
  buildCfdPoints,
  buildColumnAndPriorityDistribution,
  buildCreatedVsDoneFromCopilot,
  buildCycleTimeScatterPoints,
  buildLeadTimeHistogram,
  buildPortfolioHeatmap,
  buildRollingWeekRanges,
  buildTeamVelocity,
  buildWeeklyThroughputFromCopilot,
  collectBucketLabels,
  scrumDorReadySnapshot,
  type CopilotChatDocLike,
} from "@/lib/flux-reports-metrics";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { buildSprintStoryPointsHistory } from "@/lib/flux-reports-sprint-metrics";
import { buildSprintPredictionPayload } from "@/lib/sprint-prediction-metrics";
import { ensureBoardWeeklySentimentIndexes, listOrgSentimentHistory } from "@/lib/board-weekly-sentiment";
import { listDependencySuggestionsForOrg } from "@/lib/kv-card-dependencies";
import { logFluxApiPhase } from "@/lib/flux-api-phase-log";
import { isBoardMethodology, type BoardMethodology } from "@/lib/board-methodology";

const NUM_WEEKS = 8;
const MAX_WEEKS = 24;

type ScopeKind = "organization" | "methodology" | "boards";

function parseBoardIdsParam(request: NextRequest): string[] {
  const params = request.nextUrl.searchParams;
  const raw = [...params.getAll("boardIds"), params.get("boardIdsCsv") ?? ""]
    .join(",")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(raw)];
}

function parseMethodologyParam(request: NextRequest): BoardMethodology | undefined {
  const raw = request.nextUrl.searchParams.get("methodology");
  if (!raw) return undefined;
  return isBoardMethodology(raw) ? raw : undefined;
}

function parseWeeksParam(request: NextRequest): number {
  const raw = Number(request.nextUrl.searchParams.get("weeks"));
  if (!Number.isFinite(raw)) return NUM_WEEKS;
  return Math.max(2, Math.min(MAX_WEEKS, Math.floor(raw)));
}

function weekStartLabelFromMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Agregação org-wide para Flux Reports (dashboard ao vivo).
 */
export async function GET(request: NextRequest) {
  const route = "GET /api/flux-reports";
  const t0 = Date.now();
  const payload = await getAuthFromRequest(request);
  logFluxApiPhase(route, "getAuthFromRequest", t0);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const requestedMethodology = parseMethodologyParam(request);
    const requestedBoardIds = parseBoardIdsParam(request);
    const requestedWeeks = parseWeeksParam(request);

    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxFromAuthPayload(payload);
    try {
      assertFeatureAllowed(org, "portfolio_export", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }
    const tB = Date.now();
    const boardIdsForReports = await getBoardIds(payload.id, payload.orgId, payload.isAdmin);
    const boardsUniverse = await getBoardsFluxReportsSliceByIds(boardIdsForReports, payload.orgId);
    logFluxApiPhase(route, "getBoardsFluxReportsSliceByIds", tB);
    const boards = boardsUniverse.filter((board) => {
      if (requestedMethodology && board.boardMethodology !== requestedMethodology) return false;
      if (requestedBoardIds.length > 0 && !requestedBoardIds.includes(board.id)) return false;
      return true;
    });
    const rows = boardsToPortfolioRows(boards);
    const aggregates = aggregatePortfolio(rows);
    const nowMs = Date.now();
    const weeks = buildRollingWeekRanges(requestedWeeks, nowMs);

    const boardIds = boards.map((b) => b.id).filter(Boolean);

    let copilotChats: CopilotChatDocLike[] = [];
    const sentimentHistory: Array<{ weekLabel: string; avgScore: number; boardCount: number }> = [];
    if (isMongoConfigured() && boardIds.length) {
      const db = await getDb();
      const oldestStart = weeks[0]?.startMs ?? nowMs - requestedWeeks * 7 * 24 * 60 * 60 * 1000;
      const prevStartIso = new Date(oldestStart).toISOString();
      copilotChats = (await db
        .collection("board_copilot_chats")
        .find({ orgId: payload.orgId, boardId: { $in: boardIds }, updatedAt: { $gte: prevStartIso } })
        .toArray()) as CopilotChatDocLike[];

      await ensureBoardWeeklySentimentIndexes(db);
      const sentimentPts = await listOrgSentimentHistory({ db, orgId: payload.orgId, maxWeeks: requestedWeeks });
      sentimentHistory.push(
        ...sentimentPts.map((p) => ({
          weekLabel: weekStartLabelFromMs(p.weekStartMs),
          avgScore: p.avgScore,
          boardCount: p.boardCount,
        }))
      );
    }

    const weeklyThroughput = buildWeeklyThroughputFromCopilot(copilotChats, boardIds, weeks);
    const createdVsDone = buildCreatedVsDoneFromCopilot(copilotChats, boardIds, weeks);

    const sprintPrediction = buildSprintPredictionPayload({
      boards,
      weeks,
      weeklyThroughput,
      nowMs,
    });

    const cfdRaw = buildCfdPoints(boards, weeks);
    const keySet = new Set<string>();
    for (const p of cfdRaw) {
      for (const k of Object.keys(p.byBucketKey)) keySet.add(k);
    }
    const cfdKeys = [...keySet].sort((a, b) => a.localeCompare(b));
    const bucketLabels = collectBucketLabels(boards);
    const cfdLabels: Record<string, string> = {};
    for (const k of cfdKeys) {
      cfdLabels[k] = k === "__done__" ? "Concluídos" : bucketLabels.get(k) ?? k;
    }
    const cfdRows = cfdRaw.map((p) => {
      const row: Record<string, string | number> = { weekLabel: p.weekLabel };
      for (const k of cfdKeys) {
        row[k] = p.byBucketKey[k] ?? 0;
      }
      return row;
    });

    const cycleTimeScatter = buildCycleTimeScatterPoints(boards);
    const leadTime = buildLeadTimeHistogram(boards);
    const teamVelocity = buildTeamVelocity(boards);
    const { byColumn, byPriority } = buildColumnAndPriorityDistribution(boards);
    const heatmap = buildPortfolioHeatmap(rows);
    const avgLeadDays = averageLeadTimeDays(boards);
    const avgApproxCycleDays = averageApproxCycleTimeDays(boards);
    const blockerTagDistribution = buildBlockerTagDistribution(boards);
    const scrumDorReady = scrumDorReadySnapshot(boards);
    let sprintStoryPointsHistory: Awaited<ReturnType<typeof buildSprintStoryPointsHistory>> = [];
    try {
      sprintStoryPointsHistory = await buildSprintStoryPointsHistory(payload.orgId, boards);
    } catch {
      sprintStoryPointsHistory = [];
    }

    const generatedAt = new Date().toISOString();

    let dependencySuggestions: Array<{
      boardIdA: string;
      cardIdA: string;
      boardIdB: string;
      cardIdB: string;
      score: number;
    }> = [];
    if (isMongoConfigured()) {
      try {
        dependencySuggestions = await listDependencySuggestionsForOrg(payload.orgId, { minScore: 0.85, limit: 50 });
      } catch {
        dependencySuggestions = [];
      }
    }

    const effectiveBoardIds = boards.map((board) => board.id);
    const scopeKind: ScopeKind =
      requestedBoardIds.length > 0 ? "boards" : requestedMethodology ? "methodology" : "organization";
    const scopeLabelHint =
      scopeKind === "organization"
        ? "Organization"
        : scopeKind === "methodology"
          ? `Methodology: ${requestedMethodology}`
          : `${boards.length} selected boards`;

    logFluxApiPhase(route, "total", t0);
    return NextResponse.json({
      schema: "flux-board.reports.v1",
      generatedAt,
      dependencySuggestions,
      userId: payload.id,
      aggregates: {
        ...aggregates,
        avgLeadTimeDays: avgLeadDays,
        avgApproxCycleTimeDays: avgApproxCycleDays,
      },
      weeks: weeks.map((w) => ({ label: w.label, startMs: w.startMs, endMs: w.endMs })),
      cfd: {
        keys: cfdKeys,
        labels: cfdLabels,
        rows: cfdRows,
        note:
          "CFD aproximado: contagem por coluna atual e concluídos, restrita a cards já criados até o fim de cada semana (sem histórico de movimentação).",
      },
      weeklyThroughput,
      createdVsDone,
      cycleTimeScatter,
      leadTimeHistogram: leadTime,
      teamVelocity,
      distribution: { byColumn, byPriority },
      portfolioHeatmap: heatmap,
      sprintPrediction,
      sentimentHistory,
      meta: {
        copilotHistory: copilotChats.length > 0,
        boardCount: boards.length,
        weeks: requestedWeeks,
        scope: {
          kind: scopeKind,
          methodology: requestedMethodology,
          boardIds: scopeKind === "boards" ? effectiveBoardIds : [],
          boardCount: boards.length,
          labelHint: scopeLabelHint,
        },
        availableBoards: boardsUniverse.map((board) => ({
          id: board.id,
          name: board.name,
          methodology: board.boardMethodology ?? null,
        })),
      },
      blockerTagDistribution,
      scrumDorReady,
      sprintStoryPointsHistory,
    });
  } catch (err) {
    console.error("Flux reports API error:", err);
    return publicApiErrorResponse(err, { context: "api/flux-reports/route.ts" });
  }
}
