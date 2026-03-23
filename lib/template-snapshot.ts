import type { BoardData } from "./kv-boards";
import type { AutomationRule } from "./automation-types";
import type { BoardTemplateSnapshot } from "./template-types";

function parseCards(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c === "object") as Array<Record<string, unknown>>;
}

/** Coleta tags únicas dos cards (rótulos), sem persistir o conteúdo dos cards. */
export function collectLabelPaletteFromCards(cards: unknown): string[] {
  const set = new Set<string>();
  for (const c of parseCards(cards)) {
    const tags = c.tags;
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (typeof t === "string" && t.trim()) set.add(t.trim().slice(0, 60));
      }
    }
  }
  return [...set].slice(0, 80);
}

export function buildTemplateSnapshotFromBoard(board: BoardData, rules: AutomationRule[]): BoardTemplateSnapshot {
  const cfg = board.config as Record<string, unknown> | undefined;
  const bucketOrder = Array.isArray(cfg?.bucketOrder) ? (cfg.bucketOrder as unknown[]) : [];
  const collapsed = Array.isArray(cfg?.collapsedColumns) ? (cfg.collapsedColumns as string[]) : [];
  const rawLabels = cfg?.labels;
  const labels = Array.isArray(rawLabels) ? (rawLabels as string[]) : [];
  const mapa = Array.isArray(board.mapaProducao) ? board.mapaProducao : [];
  const fromCards = collectLabelPaletteFromCards(board.cards);
  const labelPalette = [...new Set([...labels, ...fromCards])].slice(0, 100);

  return {
    config: {
      bucketOrder,
      ...(collapsed.length ? { collapsedColumns: collapsed } : {}),
      ...(labels.length ? { labels } : {}),
    },
    mapaProducao: mapa,
    labelPalette,
    automations: Array.isArray(rules) ? rules : [],
    ...(board.boardMethodology === "scrum" || board.boardMethodology === "kanban"
      ? { boardMethodology: board.boardMethodology }
      : {}),
  };
}
