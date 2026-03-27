import type { BoardData } from "./kv-boards";
import { createBoard } from "./kv-boards";
import { setBoardAutomationRules } from "./kv-automations";
import type { BoardTemplateSnapshot } from "./template-types";
import type { BoardMethodology } from "./board-methodology";
import { attachBpmnModelToMapa } from "./bpmn-io";

function instantiateTemplateCards(snap: BoardTemplateSnapshot): unknown[] {
  const raw = Array.isArray(snap.templateCards) ? snap.templateCards : [];
  const baseId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const matrixBandFromWeight = (weight: number): "low" | "medium" | "high" | "critical" => {
    if (weight >= 76) return "critical";
    if (weight >= 56) return "high";
    if (weight >= 36) return "medium";
    return "low";
  };
  const matrixWeightFromBucket = (bucket: string): number | null => {
    const match = /^cell_r([0-3])_c([0-3])$/.exec(bucket);
    if (!match) {
      if (bucket === "do_first") return 88;
      if (bucket === "schedule") return 64;
      if (bucket === "delegate") return 44;
      if (bucket === "eliminate") return 20;
      return null;
    }
    const row = Number(match[1]);
    const col = Number(match[2]);
    const normalized = Math.max(0, Math.min(1, ((3 - row) + col) / 6));
    return Math.round(normalized * 100);
  };
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
    const bucket = typeof o.bucket === "string" ? o.bucket : "";
    const weight =
      typeof o.matrixWeight === "number" && Number.isFinite(o.matrixWeight)
        ? Math.max(0, Math.min(100, Math.round(o.matrixWeight)))
        : matrixWeightFromBucket(bucket);
    if (weight !== null) {
      o.matrixWeight = weight;
      if (typeof o.matrixWeightBand !== "string") {
        o.matrixWeightBand = matrixBandFromWeight(weight);
      }
    }
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
  const isBpmn = snap.templateKind === "bpmn" && Boolean(snap.bpmnModel);
  const methodology: BoardMethodology = isMatrix
    ? "kanban"
    : isBpmn
      ? "kanban"
      : snap.boardMethodology === "kanban"
        ? "kanban"
        : snap.boardMethodology === "lean_six_sigma"
          ? "lean_six_sigma"
          : "scrum";

  const instantiated = isMatrix ? instantiateTemplateCards(snap) : [];
  const palette = Array.isArray(snap.labelPalette) ? snap.labelPalette : [];
  const mergedLabels = isMatrix
    ? [...new Set([...labelsFromTemplateCards(instantiated), ...palette])].slice(0, 100)
    : [];

  const board = await createBoard(orgId, userId, name, {
    version: "2.0",
    cards: isMatrix
      ? instantiated
      : isBpmn
        ? (snap.bpmnModel?.nodes ?? []).map((n, i) => ({
            id: `bpmn_${i}_${n.id}`,
            bucket: "bpmn_canvas",
            priority: "Média",
            progress: "Não iniciado",
            title: n.label,
            desc: `BPMN ${n.type}`,
            tags: ["BPMN"],
            order: i,
            blockedBy: [],
          }))
        : [],
    boardMethodology: methodology,
    config: {
      ...snapConfig,
      bucketOrder: Array.isArray(snapConfig.bucketOrder)
        ? snapConfig.bucketOrder
        : isBpmn
          ? [{ key: "bpmn_canvas", label: "BPMN Canvas", color: "var(--flux-primary)" }]
          : [],
      labels: isMatrix ? mergedLabels : isBpmn ? ["BPMN"] : [],
    },
    mapaProducao: isBpmn ? attachBpmnModelToMapa(snap.bpmnModel!, snap.mapaProducao) : snap.mapaProducao,
    dailyInsights: [],
  });
  await setBoardAutomationRules(board.id, orgId, isMatrix || isBpmn ? [] : snap.automations);
  return board;
}
