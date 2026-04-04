import type { BoardData } from "@/lib/kv-boards";
import { listSprints } from "@/lib/kv-sprints";
import type { SprintData } from "@/lib/schemas";

function storyPointsFromDoneUsingCards(doneCardIds: readonly string[], cards: unknown[]): number {
  const byId = new Map<string, { storyPoints?: number | null }>();
  for (const raw of cards) {
    if (!raw || typeof raw !== "object") continue;
    const id = String((raw as { id?: string }).id ?? "").trim();
    if (!id) continue;
    byId.set(id, raw as { storyPoints?: number | null });
  }
  let pts = 0;
  for (const id of doneCardIds) {
    const c = byId.get(String(id));
    if (!c) continue;
    const sp = c.storyPoints;
    if (typeof sp === "number" && Number.isFinite(sp)) pts += sp;
  }
  return pts;
}

function completedStoryPointsForClosedSprint(sprint: SprintData, boardCards: unknown[]): number {
  const cards = sprint.scopeSnapshot?.cards ?? boardCards;
  let pts = storyPointsFromDoneUsingCards(sprint.doneCardIds ?? [], cards);
  if (pts === 0 && sprint.velocity != null && typeof sprint.velocity === "number" && Number.isFinite(sprint.velocity)) {
    pts = sprint.velocity;
  }
  return pts;
}

export type SprintStoryPointsRow = {
  boardId: string;
  boardName: string;
  sprintId: string;
  sprintName: string;
  endDate: string | null;
  completedStoryPoints: number;
  goal: string;
};

/**
 * Histórico de velocity em story points por sprint fechado (boards Scrum).
 * Soma `storyPoints` dos cards em `doneCardIds`; se zero, usa `sprint.velocity` quando numérico.
 */
export async function buildSprintStoryPointsHistory(
  orgId: string,
  boards: BoardData[]
): Promise<SprintStoryPointsRow[]> {
  const rows: SprintStoryPointsRow[] = [];
  for (const b of boards) {
    if (b.boardMethodology !== "scrum") continue;
    let sprints: Awaited<ReturnType<typeof listSprints>>;
    try {
      sprints = await listSprints(orgId, b.id);
    } catch {
      continue;
    }
    const cards = Array.isArray(b.cards) ? b.cards : [];
    for (const s of sprints) {
      if (s.status !== "closed") continue;
      const pts = completedStoryPointsForClosedSprint(s, cards);
      rows.push({
        boardId: b.id,
        boardName: b.name,
        sprintId: s.id,
        sprintName: s.name,
        endDate: s.endDate,
        completedStoryPoints: pts,
        goal: String(s.goal || "").trim(),
      });
    }
  }
  rows.sort((a, b) => {
    const ta = a.endDate ? new Date(a.endDate).getTime() : 0;
    const tb = b.endDate ? new Date(b.endDate).getTime() : 0;
    return ta - tb;
  });
  return rows;
}
