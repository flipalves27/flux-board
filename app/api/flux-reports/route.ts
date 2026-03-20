import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { ensureBoardReborn, getDefaultBoardData, listBoardsForUser } from "@/lib/kv-boards";
import { aggregatePortfolio, boardsToPortfolioRows } from "@/lib/portfolio-export-core";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, PlanGateError } from "@/lib/plan-gates";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import {
  averageLeadTimeDays,
  buildCfdPoints,
  buildColumnAndPriorityDistribution,
  buildCreatedVsDoneFromCopilot,
  buildLeadTimeHistogram,
  buildPortfolioHeatmap,
  buildRollingWeekRanges,
  buildTeamVelocity,
  buildWeeklyThroughputFromCopilot,
  collectBucketLabels,
  type CopilotChatDocLike,
} from "@/lib/flux-reports-metrics";

const NUM_WEEKS = 8;

/**
 * Agregação org-wide para Flux Reports (dashboard ao vivo).
 */
export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    try {
      assertFeatureAllowed(org, "portfolio_export");
    } catch (err) {
      if (err instanceof PlanGateError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
    await ensureBoardReborn(payload.orgId, "admin", getDefaultBoardData);

    const boards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);
    const rows = boardsToPortfolioRows(boards);
    const aggregates = aggregatePortfolio(rows);
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
    const createdVsDone = buildCreatedVsDoneFromCopilot(copilotChats, boardIds, weeks);

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

    const leadTime = buildLeadTimeHistogram(boards);
    const teamVelocity = buildTeamVelocity(boards);
    const { byColumn, byPriority } = buildColumnAndPriorityDistribution(boards);
    const heatmap = buildPortfolioHeatmap(rows);
    const avgLeadDays = averageLeadTimeDays(boards);

    const generatedAt = new Date().toISOString();

    return NextResponse.json({
      schema: "flux-board.reports.v1",
      generatedAt,
      userId: payload.id,
      aggregates: {
        ...aggregates,
        avgLeadTimeDays: avgLeadDays,
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
      leadTimeHistogram: leadTime,
      teamVelocity,
      distribution: { byColumn, byPriority },
      portfolioHeatmap: heatmap,
      meta: {
        copilotHistory: copilotChats.length > 0,
        boardCount: boards.length,
      },
    });
  } catch (err) {
    console.error("Flux reports API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
