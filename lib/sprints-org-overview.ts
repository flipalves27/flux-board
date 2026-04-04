import type { SprintData } from "./schemas";
import type { BoardMethodology } from "./board-methodology";

export type SprintWithBoardName = SprintData & {
  boardName: string;
  boardMethodology?: BoardMethodology;
};

export function mergeSprintsWithBoardMeta(
  boards: Array<{ id: string; name: string; boardMethodology?: BoardMethodology }>,
  sprintsPerBoard: ReadonlyMap<string, SprintData[]>
): SprintWithBoardName[] {
  const out: SprintWithBoardName[] = [];
  for (const b of boards) {
    const list = sprintsPerBoard.get(b.id) ?? [];
    for (const s of list) {
      out.push({ ...s, boardName: b.name, boardMethodology: b.boardMethodology });
    }
  }
  out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return out;
}

export function countActiveSprints(sprints: Iterable<SprintData>): number {
  let n = 0;
  for (const s of sprints) {
    if (s.status === "active") n++;
  }
  return n;
}
