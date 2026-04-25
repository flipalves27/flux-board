import type { ReleaseData } from "./schemas";
import type { BoardMethodology } from "./board-methodology";

const UPCOMING_STATUSES: ReadonlySet<ReleaseData["status"]> = new Set([
  "draft",
  "planned",
  "in_review",
  "staging",
]);

export type ReleaseWithBoardName = ReleaseData & {
  boardName: string;
  boardMethodology?: BoardMethodology;
  /** Resolved sprint names in the same order as `sprintIds` (empty string when missing). */
  sprintNames: string[];
};

/**
 * Merges per-board release lists with board metadata, newest first, and enriches sprint id rows with display names.
 */
export function mergeReleasesWithBoardMeta(
  boards: Array<{ id: string; name: string; boardMethodology?: BoardMethodology }>,
  releasesPerBoard: ReadonlyMap<string, ReleaseData[]>,
  sprintNameByBoard: ReadonlyMap<string, ReadonlyMap<string, string>>
): ReleaseWithBoardName[] {
  const out: ReleaseWithBoardName[] = [];
  for (const b of boards) {
    const list = releasesPerBoard.get(b.id) ?? [];
    const sprintNames = sprintNameByBoard.get(b.id);
    for (const r of list) {
      const sn = (r.sprintIds ?? []).map((sid) => (sprintNames?.get(sid) ?? "").trim() || "—");
      out.push({
        ...r,
        boardName: b.name,
        boardMethodology: b.boardMethodology,
        sprintNames: sn,
      });
    }
  }
  out.sort((a, c) => new Date(c.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return out;
}

/** “A lançar” — not archived, status in pre-release pipeline. */
export function countUpcomingReleases(releases: Iterable<ReleaseData>): number {
  let n = 0;
  for (const r of releases) {
    if (r.archivedAt) continue;
    if (UPCOMING_STATUSES.has(r.status)) n++;
  }
  return n;
}
