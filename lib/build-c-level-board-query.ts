import { isBoardViewMode, type BoardViewMode } from "@/components/kanban/kanban-constants";
import type { ExecutivePresentationFilter } from "@/stores/ui-store";

/** Query string for deep-linking into preset “Reunião C-Level” (vista executiva + atenção + modo foco). */
export function buildCLevelMeetingQuery(): string {
  const q = new URLSearchParams();
  q.set("view", "executive");
  q.set("execFilter", "attention");
  q.set("clevel", "1");
  return q.toString();
}

export function buildBoardDeepLinkPath(
  localeRoot: string,
  boardId: string,
  query: string
): string {
  const qs = query.trim();
  return `${localeRoot}/board/${encodeURIComponent(boardId)}${qs ? `?${qs}` : ""}`;
}

export function parseExecFilterParam(raw: string | null): ExecutivePresentationFilter | null {
  const v = raw?.trim().toLowerCase();
  if (v === "all" || v === "attention" || v === "momentum") return v;
  return null;
}

export function parseViewParam(raw: string | null): BoardViewMode | null {
  const v = raw?.trim();
  if (!v) return null;
  return isBoardViewMode(v) ? v : null;
}
