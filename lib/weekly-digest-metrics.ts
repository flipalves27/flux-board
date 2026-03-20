import type { BoardData } from "@/lib/kv-boards";

export type OverdueCard = {
  cardId?: string;
  title: string;
  bucket: string;
  priority: string;
  progress: string;
  dueDate: string; // YYYY-MM-DD
  daysOverdue: number;
};

export type WeeklyToolCounts = {
  created: number;
  moved: number;
  concluded: number;
};

export type WeeklyBoardToolMetrics = {
  createdCurrent: number;
  movedCurrent: number;
  concludedCurrent: number;
  createdPrevious: number;
  movedPrevious: number;
  concludedPrevious: number;
};

type CopilotToolName = "moveCard" | "createCard" | "updatePriority" | "generateBrief";

type CopilotToolResultLike = {
  tool?: string;
  ok?: boolean;
  data?: any;
};

type CopilotMessageLike = {
  role?: string;
  createdAt?: string;
  meta?: { toolResults?: CopilotToolResultLike[] } | null;
};

type CopilotChatDocLike = {
  boardId?: string;
  orgId?: string;
  updatedAt?: string;
  messages?: CopilotMessageLike[];
};

function daysUntilDue(date: string | null | undefined): number | null {
  if (!date || typeof date !== "string") return null;
  const due = new Date(`${date.trim()}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

export function computeOverdueCards(board: BoardData, nowMs?: number): OverdueCard[] {
  const cards = Array.isArray(board.cards) ? (board.cards as any[]) : [];
  // Mantemos "daysOverdue" consistente com o resto do repo (cálculo em horário local).
  const today = nowMs ?? Date.now();
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  const todayMs = now.getTime();

  const out: OverdueCard[] = [];
  for (const c of cards) {
    const dueDate = c?.dueDate;
    const progress = typeof c?.progress === "string" ? c.progress : "";
    if (!dueDate || progress === "Concluída") continue;

    const d = daysUntilDue(String(dueDate));
    if (d === null || d >= 0) continue;

    out.push({
      cardId: typeof c?.id === "string" ? c.id : undefined,
      title: typeof c?.title === "string" ? c.title : String(c?.id ?? "Card"),
      bucket: typeof c?.bucket === "string" ? c.bucket : "",
      priority: typeof c?.priority === "string" ? c.priority : "",
      progress,
      dueDate: String(dueDate),
      daysOverdue: Math.abs(d),
    });
  }

  return out
    .sort((a, b) => {
      // Primeiro: cards mais antigos (dueDate menor)
      const da = new Date(`${a.dueDate}T00:00:00`).getTime();
      const db = new Date(`${b.dueDate}T00:00:00`).getTime();
      if (da !== db) return da - db;
      // Segundo: maior tempo atrasado
      return b.daysOverdue - a.daysOverdue;
    })
    // Reduzimos para não explodir o email
    .slice(0, 10);
}

function inRange(tsMs: number, startMs: number, endMs: number): boolean {
  return tsMs >= startMs && tsMs < endMs;
}

function extractProgressForConcluded(tool: CopilotToolName, data: any): "Concluída" | null {
  if (!data || typeof data !== "object") return null;
  if (tool === "createCard") {
    const prog = data?.progress;
    if (prog === "Concluída") return "Concluída";
    return null;
  }
  if (tool === "moveCard") {
    const prog = data?.setProgress;
    if (prog === "Concluída") return "Concluída";
    return null;
  }
  return null;
}

export function computeWeeklyToolMetricsFromCopilotChats(args: {
  boardIds: string[];
  copilotChats: CopilotChatDocLike[];
  currentRange: { startMs: number; endMs: number };
  previousRange: { startMs: number; endMs: number };
}): Record<string, WeeklyBoardToolMetrics> {
  const { boardIds, copilotChats, currentRange, previousRange } = args;
  const ids = new Set(boardIds);

  const init: WeeklyBoardToolMetrics = {
    createdCurrent: 0,
    movedCurrent: 0,
    concludedCurrent: 0,
    createdPrevious: 0,
    movedPrevious: 0,
    concludedPrevious: 0,
  };

  const out: Record<string, WeeklyBoardToolMetrics> = {};
  for (const id of ids) out[id] = { ...init };

  for (const chat of copilotChats) {
    const boardId = typeof chat?.boardId === "string" ? chat.boardId : undefined;
    const messages = Array.isArray(chat?.messages) ? chat.messages : [];
    if (!boardId || !ids.has(boardId)) continue;

    for (const msg of messages) {
      const role = msg?.role;
      if (role !== "assistant") continue;

      const createdAtIso = msg?.createdAt;
      if (!createdAtIso || typeof createdAtIso !== "string") continue;
      const tsMs = new Date(createdAtIso).getTime();
      if (Number.isNaN(tsMs)) continue;

      const isCurrent = inRange(tsMs, currentRange.startMs, currentRange.endMs);
      const isPrevious = inRange(tsMs, previousRange.startMs, previousRange.endMs);
      if (!isCurrent && !isPrevious) continue;

      const toolResults = msg?.meta?.toolResults;
      if (!Array.isArray(toolResults)) continue;

      for (const tr of toolResults) {
        if (!tr?.ok) continue;
        const tool = tr?.tool as CopilotToolName | undefined;
        if (!tool) continue;
        if (tool !== "createCard" && tool !== "moveCard") continue;

        if (isCurrent) {
          if (tool === "createCard") out[boardId].createdCurrent += 1;
          if (tool === "moveCard") out[boardId].movedCurrent += 1;
          const concluded = extractProgressForConcluded(tool, tr.data);
          if (concluded) out[boardId].concludedCurrent += 1;
        }

        if (isPrevious) {
          if (tool === "createCard") out[boardId].createdPrevious += 1;
          if (tool === "moveCard") out[boardId].movedPrevious += 1;
          const concluded = extractProgressForConcluded(tool, tr.data);
          if (concluded) out[boardId].concludedPrevious += 1;
        }
      }
    }
  }

  return out;
}

