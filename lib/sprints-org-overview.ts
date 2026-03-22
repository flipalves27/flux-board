import type { SprintData } from "./schemas";

export type SprintWithBoardName = SprintData & { boardName: string };

export function mergeSprintsWithBoardMeta(
  boards: Array<{ id: string; name: string }>,
  sprintsPerBoard: ReadonlyMap<string, SprintData[]>
): SprintWithBoardName[] {
  const out: SprintWithBoardName[] = [];
  for (const b of boards) {
    const list = sprintsPerBoard.get(b.id) ?? [];
    for (const s of list) {
      out.push({ ...s, boardName: b.name });
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
