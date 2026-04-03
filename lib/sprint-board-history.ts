import type { BoardData } from "./kv-boards";
import type { SprintData } from "./schemas";
import { computeCarryoverCardIds } from "./sprint-lifecycle";
import { buildSprintCardExportRows } from "./sprint-overview";

export type BoardSprintHistoryCardRow = {
  cardId: string;
  title: string;
  bucket: string;
  bucketLabel: string;
  done: boolean;
};

export type BoardSprintHistoryRow = {
  id: string;
  name: string;
  status: SprintData["status"];
  goal: string;
  startDate: string | null;
  endDate: string | null;
  velocity: number | null;
  plannedCapacity: number | null;
  programIncrementId: string | null;
  sprintTags: string[];
  scopeCount: number;
  doneCount: number;
  carryoverCount: number;
  hasScopeSnapshot: boolean;
  updatedAt: string;
  cardRows?: BoardSprintHistoryCardRow[];
};

export function sprintToBoardHistoryRow(
  board: BoardData,
  sprint: SprintData,
  opts?: { includeCardRows?: boolean }
): BoardSprintHistoryRow {
  const carryoverCount = computeCarryoverCardIds(sprint.cardIds, sprint.doneCardIds).length;
  const row: BoardSprintHistoryRow = {
    id: sprint.id,
    name: sprint.name,
    status: sprint.status,
    goal: String(sprint.goal ?? "").trim(),
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    velocity: sprint.velocity,
    plannedCapacity: sprint.plannedCapacity,
    programIncrementId: sprint.programIncrementId,
    sprintTags: sprint.sprintTags ?? [],
    scopeCount: sprint.cardIds.length,
    doneCount: sprint.doneCardIds.length,
    carryoverCount,
    hasScopeSnapshot: Boolean(sprint.scopeSnapshot),
    updatedAt: sprint.updatedAt,
  };
  if (opts?.includeCardRows) {
    row.cardRows = buildSprintCardExportRows(board, sprint);
  }
  return row;
}
