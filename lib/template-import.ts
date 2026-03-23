import type { BoardData } from "./kv-boards";
import { createBoard } from "./kv-boards";
import { setBoardAutomationRules } from "./kv-automations";
import type { BoardTemplateSnapshot } from "./template-types";
import type { BoardMethodology } from "./board-methodology";

function instantiateTemplateCards(snap: BoardTemplateSnapshot): unknown[] {
  const raw = Array.isArray(snap.templateCards) ? snap.templateCards : [];
  const baseId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return raw.map((item, i) => {
    const o = item && typeof item === "object" ? ({ ...item } as Record<string, unknown>) : {};
    delete o.automationState;
    delete o.completedAt;
    delete o.completedCycleDays;
    delete o.columnEnteredAt;
    delete o.dodChecks;
    delete o.subtasks;
    delete o.subtaskProgress;
    o.id = `tplc_${baseId}_${i}`;
    o.blockedBy = [];
    return o;
  });
}

function labelsFromTemplateCards(cards: unknown[]): string[] {
  const set = new Set<string>();
  for (const c of cards) {
    if (!c || typeof c !== "object") continue;
    const tags = (c as Record<string, unknown>).tags;
    if (!Array.isArray(tags)) continue;
    for (const t of tags) {
      if (typeof t === "string" && t.trim()) set.add(t.trim().slice(0, 60));
    }
  }
  return [...set].slice(0, 100);
}

export async function createBoardFromTemplateSnapshot(
  orgId: string,
  userId: string,
  name: string,
  snap: BoardTemplateSnapshot
): Promise<BoardData> {
  const snapConfig = (snap.config ?? {}) as Partial<NonNullable<BoardData["config"]>>;
  const isMatrix = snap.templateKind === "priority_matrix";
  const methodology: BoardMethodology = isMatrix
    ? "kanban"
    : snap.boardMethodology === "kanban"
      ? "kanban"
      : "scrum";

  const instantiated = isMatrix ? instantiateTemplateCards(snap) : [];
  const palette = Array.isArray(snap.labelPalette) ? snap.labelPalette : [];
  const mergedLabels = isMatrix
    ? [...new Set([...labelsFromTemplateCards(instantiated), ...palette])].slice(0, 100)
    : [];

  const board = await createBoard(orgId, userId, name, {
    version: "2.0",
    cards: isMatrix ? instantiated : [],
    boardMethodology: methodology,
    config: {
      ...snapConfig,
      bucketOrder: Array.isArray(snapConfig.bucketOrder) ? snapConfig.bucketOrder : [],
      labels: isMatrix ? mergedLabels : [],
    },
    mapaProducao: snap.mapaProducao,
    dailyInsights: [],
  });
  await setBoardAutomationRules(board.id, orgId, isMatrix ? [] : snap.automations);
  return board;
}
