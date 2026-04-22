export const KANBAN_FILTERS_STORAGE_PREFIX = "flux.kanban.filters:";
export const BOARD_VIEW_STORAGE_PREFIX = "flux.board.viewMode:";

/** Board canvas mode; persisted per board in ui-store (localStorage). */
export type BoardViewMode = "kanban" | "table" | "timeline" | "eisenhower" | "executive";

export const DIR_COLORS: Record<string, string> = {
  manter: "var(--flux-success-solid-dark)",
  priorizar: "var(--flux-teal-foreground)",
  adiar: "var(--flux-warning-foreground)",
  cancelar: "var(--flux-danger-accent)",
  reavaliar: "var(--flux-text-muted)",
};

/**
 * Columns with at least this many **visible** cards wrap each card row with
 * `content-visibility: auto` so large boards skip off-screen paint work.
 * All nodes stay mounted so @dnd-kit droppables keep working.
 */
export const KANBAN_COLUMN_CARD_CV_THRESHOLD = 36;

export const COLUMN_COLORS = [
  "var(--flux-text-muted)",
  "var(--flux-primary)",
  "var(--flux-secondary)",
  "var(--flux-accent)",
  "var(--flux-warning)",
  "var(--flux-success)",
  "var(--flux-info)",
  "var(--flux-accent-dark)",
];
