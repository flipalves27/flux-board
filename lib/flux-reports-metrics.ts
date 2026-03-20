import type { BoardData } from "@/lib/kv-boards";
import { boardsToPortfolioRows, type PortfolioRow } from "@/lib/portfolio-export-core";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CopilotToolName = "moveCard" | "createCard" | "updatePriority" | "generateBrief";

export type CopilotToolResultLike = {
  tool?: string;
  ok?: boolean;
  data?: unknown;
};

export type CopilotMessageLike = {
  role?: string;
  createdAt?: string;
  meta?: { toolResults?: CopilotToolLike[] } | null;
};

type CopilotToolLike = CopilotToolResultLike;

export type CopilotChatDocLike = {
  boardId?: string;
  orgId?: string;
  updatedAt?: string;
  messages?: CopilotMessageLike[];
};

export type FluxWeekRange = {
  label: string;
  startMs: number;
  endMs: number;
};

function inRange(tsMs: number, startMs: number, endMs: number): boolean {
  return tsMs >= startMs && tsMs < endMs;
}

function extractProgressForConcluded(tool: CopilotToolName, data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const rec = data as Record<string, unknown>;
  if (tool === "createCard") {
    return rec.progress === "Concluída";
  }
  if (tool === "moveCard") {
    return rec.setProgress === "Concluída";
  }
  return false;
}

/** Últimas `numWeeks` janelas de 7 dias, da mais antiga à mais recente (esquerda → direita no gráfico). */
export function buildRollingWeekRanges(numWeeks: number, nowMs: number): FluxWeekRange[] {
  const out: FluxWeekRange[] = [];
  for (let i = 0; i < numWeeks; i++) {
    const endMs = nowMs - (numWeeks - 1 - i) * 7 * DAY_MS;
    const startMs = endMs - 7 * DAY_MS;
    const d = new Date(endMs);
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ label, startMs, endMs });
  }
  return out;
}

export function parseCardCreatedMs(card: unknown, board: BoardData): number | null {
  if (!card || typeof card !== "object") return null;
  const c = card as Record<string, unknown>;
  const raw = typeof c.createdAt === "string" ? c.createdAt : null;
  if (raw) {
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (typeof board.createdAt === "string") {
    const t = new Date(board.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

/** CFD aproximado: por semana, contagem cumulativa de cards existentes até o fim da semana, por coluna atual (ou concluídos). */
export function buildCfdPoints(boards: BoardData[], weeks: FluxWeekRange[]): Array<{
  weekLabel: string;
  weekEndMs: number;
  byBucketKey: Record<string, number>;
}> {
  return weeks.map((w) => {
    const byBucketKey: Record<string, number> = {};
    for (const board of boards) {
      const cards = Array.isArray(board.cards) ? board.cards : [];
      for (const card of cards) {
        const created = parseCardCreatedMs(card, board);
        if (created === null || created > w.endMs) continue;
        if (!card || typeof card !== "object") continue;
        const rec = card as Record<string, unknown>;
        const progress = String(rec.progress || "");
        if (progress === "Concluída") {
          byBucketKey.__done__ = (byBucketKey.__done__ ?? 0) + 1;
        } else {
          const bk = String(rec.bucket || "unknown");
          byBucketKey[bk] = (byBucketKey[bk] ?? 0) + 1;
        }
      }
    }
    return { weekLabel: w.label, weekEndMs: w.endMs, byBucketKey };
  });
}

export function collectBucketLabels(boards: BoardData[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const board of boards) {
    const order = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
    for (const b of order) {
      if (b && typeof b === "object") {
        const rec = b as Record<string, unknown>;
        const key = String(rec.key || "");
        if (!key) continue;
        if (!map.has(key)) {
          map.set(key, String(rec.label || rec.key || key));
        }
      }
    }
  }
  return map;
}

export type WeeklyThroughputPoint = {
  weekLabel: string;
  concluded: number;
};

export function buildWeeklyThroughputFromCopilot(
  copilotChats: CopilotChatDocLike[],
  boardIds: string[],
  weeks: FluxWeekRange[]
): WeeklyThroughputPoint[] {
  const ids = new Set(boardIds);
  const counts = weeks.map(() => 0);

  for (const chat of copilotChats) {
    const boardId = typeof chat?.boardId === "string" ? chat.boardId : undefined;
    const messages = Array.isArray(chat?.messages) ? chat.messages : [];
    if (!boardId || !ids.has(boardId)) continue;

    for (const msg of messages) {
      if (msg?.role !== "assistant") continue;
      const createdAtIso = msg?.createdAt;
      if (!createdAtIso || typeof createdAtIso !== "string") continue;
      const tsMs = new Date(createdAtIso).getTime();
      if (Number.isNaN(tsMs)) continue;

      const toolResults = msg?.meta?.toolResults;
      if (!Array.isArray(toolResults)) continue;

      for (const tr of toolResults) {
        if (!tr?.ok) continue;
        const tool = tr?.tool as CopilotToolName | undefined;
        if (!tool || (tool !== "createCard" && tool !== "moveCard")) continue;
        const concluded = extractProgressForConcluded(tool, tr.data);
        if (!concluded) continue;

        for (let wi = 0; wi < weeks.length; wi++) {
          const w = weeks[wi];
          if (inRange(tsMs, w.startMs, w.endMs)) {
            counts[wi] += 1;
            break;
          }
        }
      }
    }
  }

  return weeks.map((w, i) => ({ weekLabel: w.label, concluded: counts[i] }));
}

export type LeadTimeBin = { label: string; count: number };

/** Histograma de “lead time” aproximado (dias) para cards concluídos com createdAt. */
export function buildLeadTimeHistogram(boards: BoardData[]): LeadTimeBin[] {
  const bins = [
    { label: "0–3", min: 0, max: 3, count: 0 },
    { label: "4–7", min: 4, max: 7, count: 0 },
    { label: "8–14", min: 8, max: 14, count: 0 },
    { label: "15–30", min: 15, max: 30, count: 0 },
    { label: "31+", min: 31, max: 1e9, count: 0 },
  ];

  for (const board of boards) {
    const boardUpdated = typeof board.lastUpdated === "string" ? new Date(board.lastUpdated).getTime() : null;
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const card of cards) {
      if (!card || typeof card !== "object") continue;
      const rec = card as Record<string, unknown>;
      if (String(rec.progress || "") !== "Concluída") continue;
      const createdMs = parseCardCreatedMs(card, board);
      if (createdMs === null || boardUpdated === null || Number.isNaN(boardUpdated)) continue;
      const days = Math.max(0, Math.floor((boardUpdated - createdMs) / DAY_MS));
      for (const b of bins) {
        if (days >= b.min && days <= b.max) {
          b.count += 1;
          break;
        }
      }
    }
  }

  return bins.map(({ label, count }) => ({ label, count }));
}

export type TeamVelocityRow = { name: string; moves: number };

/** Contagem de cards por responsável (campo opcional `owner` no card). */
export function buildTeamVelocity(boards: BoardData[]): TeamVelocityRow[] {
  const map = new Map<string, number>();
  for (const board of boards) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const card of cards) {
      if (!card || typeof card !== "object") continue;
      const rec = card as Record<string, unknown>;
      const owner = rec.owner;
      const name =
        typeof owner === "string" && owner.trim()
          ? owner.trim()
          : typeof rec.assignee === "string" && String(rec.assignee).trim()
            ? String(rec.assignee).trim()
            : "";
      if (!name) continue;
      map.set(name, (map.get(name) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, moves]) => ({ name, moves }))
    .sort((a, b) => b.moves - a.moves)
    .slice(0, 12);
}

export type ColumnCount = { key: string; label: string; count: number };
export type PriorityCount = { priority: string; count: number };

export function buildColumnAndPriorityDistribution(boards: BoardData[]): {
  byColumn: ColumnCount[];
  byPriority: PriorityCount[];
} {
  const colMap = new Map<string, number>();
  const priMap = new Map<string, number>();
  const labels = collectBucketLabels(boards);

  for (const board of boards) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const card of cards) {
      if (!card || typeof card !== "object") continue;
      const rec = card as Record<string, unknown>;
      if (String(rec.progress || "") === "Concluída") continue;
      const bk = String(rec.bucket || "unknown");
      colMap.set(bk, (colMap.get(bk) ?? 0) + 1);
      const pr = String(rec.priority || "—");
      priMap.set(pr, (priMap.get(pr) ?? 0) + 1);
    }
  }

  const byColumn: ColumnCount[] = [...colMap.entries()]
    .map(([key, count]) => ({ key, label: labels.get(key) ?? key, count }))
    .sort((a, b) => b.count - a.count);

  const byPriority: PriorityCount[] = [...priMap.entries()]
    .map(([priority, count]) => ({ priority, count }))
    .sort((a, b) => b.count - a.count);

  return { byColumn, byPriority };
}

export type PortfolioHeatCell = {
  boardId: string;
  name: string;
  risco: number | null;
  throughput: number | null;
  cardCount: number;
};

export function buildPortfolioHeatmap(rows: PortfolioRow[]): PortfolioHeatCell[] {
  return rows.map((r) => ({
    boardId: r.id,
    name: r.name,
    risco: r.portfolio.risco,
    throughput: r.portfolio.throughput,
    cardCount: r.portfolio.cardCount,
  }));
}

export type CreatedVsDoneWeek = {
  weekLabel: string;
  created: number;
  concluded: number;
};

export function buildCreatedVsDoneFromCopilot(
  copilotChats: CopilotChatDocLike[],
  boardIds: string[],
  weeks: FluxWeekRange[]
): CreatedVsDoneWeek[] {
  const ids = new Set(boardIds);
  const created = weeks.map(() => 0);
  const concluded = weeks.map(() => 0);

  for (const chat of copilotChats) {
    const boardId = typeof chat?.boardId === "string" ? chat.boardId : undefined;
    const messages = Array.isArray(chat?.messages) ? chat.messages : [];
    if (!boardId || !ids.has(boardId)) continue;

    for (const msg of messages) {
      if (msg?.role !== "assistant") continue;
      const createdAtIso = msg?.createdAt;
      if (!createdAtIso || typeof createdAtIso !== "string") continue;
      const tsMs = new Date(createdAtIso).getTime();
      if (Number.isNaN(tsMs)) continue;

      const toolResults = msg?.meta?.toolResults;
      if (!Array.isArray(toolResults)) continue;

      for (const tr of toolResults) {
        if (!tr?.ok) continue;
        const tool = tr?.tool as CopilotToolName | undefined;
        if (!tool || (tool !== "createCard" && tool !== "moveCard")) continue;

        for (let wi = 0; wi < weeks.length; wi++) {
          const w = weeks[wi];
          if (!inRange(tsMs, w.startMs, w.endMs)) continue;

          if (tool === "createCard") created[wi] += 1;
          if (extractProgressForConcluded(tool, tr.data)) concluded[wi] += 1;
          break;
        }
      }
    }
  }

  return weeks.map((w, i) => ({
    weekLabel: w.label,
    created: created[i],
    concluded: concluded[i],
  }));
}

export function averageLeadTimeDays(boards: BoardData[]): number | null {
  const daysList: number[] = [];
  for (const board of boards) {
    const boardUpdated = typeof board.lastUpdated === "string" ? new Date(board.lastUpdated).getTime() : null;
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const card of cards) {
      if (!card || typeof card !== "object") continue;
      const rec = card as Record<string, unknown>;
      if (String(rec.progress || "") !== "Concluída") continue;
      const createdMs = parseCardCreatedMs(card, board);
      if (createdMs === null || boardUpdated === null || Number.isNaN(boardUpdated)) continue;
      daysList.push(Math.max(0, Math.floor((boardUpdated - createdMs) / DAY_MS)));
    }
  }
  if (daysList.length === 0) return null;
  const sum = daysList.reduce((a, b) => a + b, 0);
  return Math.round((sum / daysList.length) * 10) / 10;
}

export { boardsToPortfolioRows };
export type { PortfolioRow };
