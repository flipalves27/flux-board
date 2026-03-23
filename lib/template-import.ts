import type { BoardData } from "./kv-boards";
import { createBoard } from "./kv-boards";
import { setBoardAutomationRules } from "./kv-automations";
import type { BoardTemplateSnapshot } from "./template-types";
import type { BoardMethodology } from "./board-methodology";

export async function createBoardFromTemplateSnapshot(
  orgId: string,
  userId: string,
  name: string,
  snap: BoardTemplateSnapshot
): Promise<BoardData> {
  const snapConfig = (snap.config ?? {}) as Partial<NonNullable<BoardData["config"]>>;
  const methodology: BoardMethodology = snap.boardMethodology === "kanban" ? "kanban" : "scrum";
  const board = await createBoard(orgId, userId, name, {
    version: "2.0",
    cards: [],
    boardMethodology: methodology,
    config: {
      ...snapConfig,
      bucketOrder: Array.isArray(snapConfig.bucketOrder) ? snapConfig.bucketOrder : [],
      labels: [],
    },
    mapaProducao: snap.mapaProducao,
    dailyInsights: [],
  });
  await setBoardAutomationRules(board.id, orgId, snap.automations);
  return board;
}
