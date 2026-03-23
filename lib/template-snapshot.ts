import type { BoardData } from "./kv-boards";
import type { AutomationRule } from "./automation-types";
import type { BoardTemplateSnapshot, PriorityMatrixQuadrantKey } from "./template-types";

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

/** Colunas fixas da matriz Eisenhower (rótulos em PT; chaves estáveis para import). */
export function priorityMatrixBucketOrder(): Array<{ key: string; label: string; color: string }> {
  return [
    { key: "do_first", label: "Urgente e importante", color: "var(--flux-danger)" },
    { key: "schedule", label: "Importante, não urgente", color: "var(--flux-secondary)" },
    { key: "delegate", label: "Urgente, não importante", color: "var(--flux-warning)" },
    { key: "eliminate", label: "Nem urgente nem importante", color: "var(--flux-text-muted)" },
  ];
}

function cardToTemplateSeed(
  card: Record<string, unknown>,
  quadrantKey: PriorityMatrixQuadrantKey,
  order: number
): Record<string, unknown> {
  const titleRaw = typeof card.title === "string" ? card.title.trim().slice(0, 300) : "";
  const desc = typeof card.desc === "string" ? card.desc.slice(0, 6000) : "";
  const priority = typeof card.priority === "string" && card.priority.trim() ? card.priority.trim().slice(0, 100) : "Média";
  const progress =
    typeof card.progress === "string" && card.progress.trim() ? card.progress.trim().slice(0, 100) : "Não iniciado";
  const tags = Array.isArray(card.tags)
    ? card.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 30)
    : [];
  const base: Record<string, unknown> = {
    bucket: quadrantKey,
    priority,
    progress,
    title: titleRaw || "Card",
    desc,
    tags,
    direction: typeof card.direction === "string" && card.direction ? card.direction : null,
    dueDate: card.dueDate === null || typeof card.dueDate === "string" ? card.dueDate : null,
    order,
    blockedBy: [],
  };
  if (Array.isArray(card.links)) base.links = card.links;
  if (Array.isArray(card.docRefs)) base.docRefs = card.docRefs;
  if (typeof card.storyPoints === "number" || card.storyPoints === null) base.storyPoints = card.storyPoints;
  if (card.serviceClass !== undefined) base.serviceClass = card.serviceClass;
  return base;
}

export type PriorityMatrixSelection = { cardId: string; quadrantKey: PriorityMatrixQuadrantKey };

/**
 * Snapshot de matriz de priorização: quatro colunas + cópias de cards por quadrante.
 * Não inclui automações (colunas diferentes do board de origem).
 */
export function buildPriorityMatrixSnapshotFromBoard(
  board: BoardData,
  selections: PriorityMatrixSelection[]
): BoardTemplateSnapshot {
  const byId = new Map<string, Record<string, unknown>>();
  for (const c of parseCards(board.cards)) {
    const id = typeof c.id === "string" ? c.id : "";
    if (id) byId.set(id, c);
  }

  const orderByQuadrant: Record<PriorityMatrixQuadrantKey, number> = {
    do_first: 0,
    schedule: 0,
    delegate: 0,
    eliminate: 0,
  };

  const templateCards: unknown[] = [];
  for (const sel of selections) {
    const card = byId.get(sel.cardId);
    if (!card) {
      throw new Error(`Card não encontrado no board: ${sel.cardId}`);
    }
    const q = sel.quadrantKey;
    const ord = orderByQuadrant[q]++;
    templateCards.push(cardToTemplateSeed(card, q, ord));
  }

  const labelPalette = [...new Set([...collectLabelPaletteFromCards(templateCards)])].slice(0, 100);

  return {
    templateKind: "priority_matrix",
    config: {
      bucketOrder: priorityMatrixBucketOrder(),
      collapsedColumns: [],
    },
    mapaProducao: [],
    labelPalette,
    automations: [],
    boardMethodology: "kanban",
    templateCards,
  };
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
