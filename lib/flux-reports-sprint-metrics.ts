import type { BoardData } from "@/lib/kv-boards";
import { listSprints } from "@/lib/kv-sprints";

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
    const byId = new Map(cards.map((c) => [String((c as { id?: string }).id || ""), c]));
    for (const s of sprints) {
      if (s.status !== "closed") continue;
      let pts = 0;
      for (const id of s.doneCardIds ?? []) {
        const c = byId.get(String(id));
        if (!c || typeof c !== "object") continue;
        const sp = (c as { storyPoints?: number | null }).storyPoints;
        if (typeof sp === "number" && Number.isFinite(sp)) pts += sp;
      }
      if (pts === 0 && s.velocity != null && typeof s.velocity === "number" && Number.isFinite(s.velocity)) {
        pts = s.velocity;
      }
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
