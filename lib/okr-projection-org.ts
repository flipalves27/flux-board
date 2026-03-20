import type { BoardData } from "@/lib/kv-boards";
import {
  buildRollingWeekRanges,
  buildWeeklyConcludedByBoardFromCopilot,
  type CopilotChatDocLike,
} from "@/lib/flux-reports-metrics";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { listObjectivesWithKeyResults } from "@/lib/kv-okrs";
import { buildProjectionsForObjectives, type OkrKrProjection } from "@/lib/okr-projection";

/**
 * Projeções OKR para digest semanal / alertas (visão org + quarter).
 */
export async function loadOkrProjectionsForOrgQuarter(args: {
  orgId: string;
  quarter: string;
  boards: BoardData[];
  nowMs?: number;
}): Promise<OkrKrProjection[]> {
  const { orgId, quarter, boards, nowMs: nowMsArg } = args;
  const nowMs = nowMsArg ?? Date.now();

  const grouped = await listObjectivesWithKeyResults(orgId, quarter);
  if (!grouped.length) return [];

  const linkedBoardIds = Array.from(new Set(grouped.flatMap((g) => g.keyResults.map((kr) => kr.linkedBoardId))));
  const boardById = new Map(boards.map((b) => [b.id, b]));

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

  return buildProjectionsForObjectives({
    grouped,
    boardById,
    weekConcludedByBoardId,
    nowMs,
  });
}
