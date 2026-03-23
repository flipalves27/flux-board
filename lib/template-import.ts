import type { BoardData } from "./kv-boards";
import { createBoard } from "./kv-boards";
import { setBoardAutomationRules } from "./kv-automations";
import type { BoardTemplateSnapshot } from "./template-types";

export async function createBoardFromTemplateSnapshot(
  orgId: string,
  userId: string,
  name: string,
  snap: BoardTemplateSnapshot
): Promise<BoardData> {
  const board = await createBoard(orgId, userId, name, {
    version: "2.0",
    cards: [],
    config: {
      ...(snap.config as BoardData["config"]),
      labels: [],
    },
    mapaProducao: snap.mapaProducao,
    dailyInsights: [],
  });
  await setBoardAutomationRules(board.id, orgId, snap.automations);
  return board;
}
