import { getBoardsByIds, userCanAccessBoard } from "@/lib/kv-boards";
import { getObjectivesAndKeyResultsByBoard } from "@/lib/kv-okrs";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import {
  buildRollingWeekRanges,
  buildWeeklyConcludedByBoardFromCopilot,
  type CopilotChatDocLike,
} from "@/lib/flux-reports-metrics";
import { buildProjectionsForObjectives, type OkrKrProjection } from "@/lib/okr-projection";

export type OkrProjectionLoadResult = {
  boardId: string;
  quarter: string | null;
  grouped: Awaited<ReturnType<typeof getObjectivesAndKeyResultsByBoard>>;
  projections: OkrKrProjection[];
  copilotHistory: boolean;
};

/**
 * Carrega projeções OKR para um board (mesma lógica do GET /api/okrs/projection).
 */
export async function loadOkrProjectionsForBoard(params: {
  orgId: string;
  userId: string;
  isAdmin: boolean;
  boardId: string;
  quarter: string | null;
}): Promise<OkrProjectionLoadResult> {
  const { orgId, userId, isAdmin, boardId, quarter } = params;

  const canAccess = await userCanAccessBoard(userId, orgId, isAdmin, boardId);
  if (!canAccess) {
    throw new Error("Sem permissão para este board.");
  }

  const grouped = await getObjectivesAndKeyResultsByBoard({
    orgId,
    boardId,
    quarter,
  });

  const linkedBoardIds = Array.from(new Set(grouped.flatMap((g) => g.keyResults.map((kr) => kr.linkedBoardId))));

  for (const bid of linkedBoardIds) {
    const ok = await userCanAccessBoard(userId, orgId, isAdmin, bid);
    if (!ok) {
      throw new Error("Sem permissão para um dos boards vinculados aos KRs.");
    }
  }

  const boards = await getBoardsByIds(linkedBoardIds, orgId);
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
      .find({ orgId, boardId: { $in: linkedBoardIds }, updatedAt: { $gte: prevStartIso } })
      .toArray()) as CopilotChatDocLike[];
  }

  const weekConcludedByBoardId = new Map<string, number[]>();
  for (const bid of linkedBoardIds) {
    weekConcludedByBoardId.set(bid, buildWeeklyConcludedByBoardFromCopilot(copilotChats, bid, weeks));
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

  return {
    boardId,
    quarter,
    grouped,
    projections,
    copilotHistory: copilotChats.length > 0,
  };
}
