/**
 * Visual variants for Kanban cards (blocked, done, overdue, AI-enriched).
 * Classes are defined in app/globals.css (`.flux-kanban-card--*`).
 */
export type KanbanCardSurfaceVariant = "default" | "done" | "overdue" | "blocked" | "ai";

export function resolveKanbanCardSurfaceVariant(args: {
  progressDone: boolean;
  daysRemaining: number | null;
  isBlockedOpen: boolean;
  hasAiSurface: boolean;
}): KanbanCardSurfaceVariant {
  if (args.progressDone) return "done";
  if (args.daysRemaining !== null && args.daysRemaining < 0) return "overdue";
  if (args.isBlockedOpen) return "blocked";
  if (args.hasAiSurface) return "ai";
  return "default";
}

export function kanbanCardVariantClass(v: KanbanCardSurfaceVariant): string {
  if (v === "default") return "";
  return `flux-kanban-card--${v}`;
}
