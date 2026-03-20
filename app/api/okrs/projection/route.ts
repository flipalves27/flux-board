import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, PlanGateError } from "@/lib/plan-gates";
import { getBoardsByIds, userCanAccessBoard } from "@/lib/kv-boards";
import { getObjectivesAndKeyResultsByBoard } from "@/lib/kv-okrs";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import {
  buildRollingWeekRanges,
  buildWeeklyConcludedByBoardFromCopilot,
  type CopilotChatDocLike,
} from "@/lib/flux-reports-metrics";
import { buildProjectionsForObjectives } from "@/lib/okr-projection";

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const org = await getOrganizationById(payload.orgId);
    try {
      assertFeatureAllowed(org, "okr_engine");
    } catch (err) {
      if (err instanceof PlanGateError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    const boardId = request.nextUrl.searchParams.get("boardId");
    if (!boardId) return NextResponse.json({ error: "boardId é obrigatório" }, { status: 400 });
    const quarter = request.nextUrl.searchParams.get("quarter");

    const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
    if (!canAccess) return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });

    const grouped = await getObjectivesAndKeyResultsByBoard({
      orgId: payload.orgId,
      boardId,
      quarter: quarter || null,
    });

    const linkedBoardIds = Array.from(new Set(grouped.flatMap((g) => g.keyResults.map((kr) => kr.linkedBoardId))));

    for (const bid of linkedBoardIds) {
      const ok = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, bid);
      if (!ok) {
        return NextResponse.json(
          { error: "Sem permissão para um dos boards vinculados aos KRs." },
          { status: 403 }
        );
      }
    }

    const boards = await getBoardsByIds(linkedBoardIds, payload.orgId);
    const boardById = new Map(boards.map((b) => [b.id, b]));

    const nowMs = Date.now();
    const weeks = buildRollingWeekRanges(4, nowMs);
    const oldestStart = weeks[0]?.startMs ?? nowMs - 4 * 7 * 24 * 60 * 60 * 1000;

    let copilotChats: CopilotChatDocLike[] = [];
    if (isMongoConfigured() && linkedBoardIds.length) {
      const db = await getDb();
      const prevStartIso = new Date(oldestStart).toISOString();
      copilotChats = (await db
        .collection("board_copilot_chats")
        .find({ orgId: payload.orgId, boardId: { $in: linkedBoardIds }, updatedAt: { $gte: prevStartIso } })
        .toArray()) as CopilotChatDocLike[];
    }

    const weekConcludedByBoardId = new Map<string, number[]>();
    for (const bid of linkedBoardIds) {
      weekConcludedByBoardId.set(
        bid,
        buildWeeklyConcludedByBoardFromCopilot(copilotChats, bid, weeks)
      );
    }

    const projections = buildProjectionsForObjectives({
      grouped: grouped.map((g) => ({
        objective: g.objective,
        keyResults: g.keyResults,
      })),
      boardById,
      weekConcludedByBoardId,
      nowMs,
    });

    return NextResponse.json({
      ok: true,
      boardId,
      quarter: quarter || null,
      generatedAt: new Date().toISOString(),
      copilotHistory: copilotChats.length > 0,
      weeks: weeks.map((w) => ({ label: w.label, startMs: w.startMs, endMs: w.endMs })),
      projections,
    });
  } catch (err) {
    console.error("OKRs projection API error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
