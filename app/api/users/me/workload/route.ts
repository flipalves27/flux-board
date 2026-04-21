import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoardIds, getBoard } from "@/lib/kv-boards";
import {
  computePersonalWorkload,
  suggestWorkPriority,
  type PersonalCardSummary,
} from "@/lib/personal-work-ai";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const boardIds = await getBoardIds(payload.id, payload.orgId, !!payload.isAdmin);
  const assignedCards: PersonalCardSummary[] = [];
  const completedDates: string[] = [];

  for (const bid of boardIds.slice(0, 20)) {
    const board = await getBoard(bid, payload.orgId);
    if (!board) continue;
    const boardName = typeof board.name === "string" ? board.name : bid;
    const cards = Array.isArray(board.cards) ? board.cards : [];

    for (const raw of cards) {
      const c = raw as Record<string, unknown>;
      const assignee = String(c.assignee || c.responsible || "");
      const isAssigned = assignee === payload.id || assignee === payload.username;

      if (isAssigned || (String(c.direction || "") && cards.length <= 30)) {
        const progress = String(c.progress || "");
        if (progress === "Concluída") {
          if (typeof c.completedAt === "string") completedDates.push(c.completedAt);
          continue;
        }

        assignedCards.push({
          id: String(c.id || ""),
          title: String(c.title || ""),
          boardId: bid,
          boardName,
          bucket: String(c.bucket || ""),
          priority: String(c.priority || "Média"),
          progress,
          dueDate: typeof c.dueDate === "string" ? c.dueDate : null,
          blockedBy: Array.isArray(c.blockedBy) ? c.blockedBy.filter((x: unknown) => typeof x === "string") : [],
          storyPoints: typeof c.storyPoints === "number" ? c.storyPoints : null,
          columnEnteredAt: typeof c.columnEnteredAt === "string" ? c.columnEnteredAt : null,
        });
      }
    }
  }

  const stats = computePersonalWorkload(assignedCards, completedDates);
  const suggestions = suggestWorkPriority(assignedCards);

  return NextResponse.json({
    ok: true,
    cards: assignedCards.slice(0, 50),
    stats,
    suggestions: suggestions.slice(0, 20),
  });
}
