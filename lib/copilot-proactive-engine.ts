const DAY_MS = 24 * 60 * 60 * 1000;

export type NudgeType =
  | "stale_card"
  | "wip_limit_exceeded"
  | "similar_lead_time"
  | "no_description"
  | "overdue"
  | "unbalanced_workload"
  | "blocked_chain";

export type ProactiveNudge = {
  id: string;
  type: NudgeType;
  severity: "info" | "warning" | "critical";
  message: string;
  cardId?: string;
  column?: string;
  dismissible: boolean;
};

type CardLike = {
  id: string;
  title: string;
  desc?: string;
  bucket: string;
  progress: string;
  columnEnteredAt?: string;
  dueDate?: string | null;
  blockedBy?: string[];
  assignee?: string;
};

type ColumnConfig = {
  key: string;
  label: string;
  wipLimit?: number;
};

export function generateProactiveNudges(
  cards: CardLike[],
  columns: ColumnConfig[],
  opts: { staleDays?: number; maxNudges?: number } = {}
): ProactiveNudge[] {
  const staleDays = opts.staleDays ?? 5;
  const maxNudges = opts.maxNudges ?? 8;
  const now = Date.now();
  const nudges: ProactiveNudge[] = [];

  const activeCards = cards.filter((c) => c.progress !== "Concluída");

  for (const card of activeCards) {
    if (card.columnEnteredAt) {
      const enteredMs = new Date(card.columnEnteredAt).getTime();
      const daysInColumn = (now - enteredMs) / DAY_MS;
      if (daysInColumn > staleDays && card.progress !== "Não iniciado") {
        nudges.push({
          id: `stale:${card.id}`,
          type: "stale_card",
          severity: daysInColumn > staleDays * 2 ? "critical" : "warning",
          message: `Card "${card.title}" está na mesma coluna há ${Math.round(daysInColumn)} dias sem movimentação.`,
          cardId: card.id,
          column: card.bucket,
          dismissible: true,
        });
      }
    }

    if (!card.desc || card.desc.trim().length < 10) {
      nudges.push({
        id: `nodesc:${card.id}`,
        type: "no_description",
        severity: "info",
        message: `Card "${card.title}" não possui descrição detalhada. Considere adicionar contexto.`,
        cardId: card.id,
        dismissible: true,
      });
    }

    if (card.dueDate) {
      const dueMs = new Date(card.dueDate).getTime();
      const daysUntilDue = (dueMs - now) / DAY_MS;
      if (daysUntilDue < 0) {
        nudges.push({
          id: `overdue:${card.id}`,
          type: "overdue",
          severity: "critical",
          message: `Card "${card.title}" está atrasado há ${Math.abs(Math.round(daysUntilDue))} dia(s).`,
          cardId: card.id,
          dismissible: true,
        });
      } else if (daysUntilDue < 2) {
        nudges.push({
          id: `duesoon:${card.id}`,
          type: "overdue",
          severity: "warning",
          message: `Card "${card.title}" vence em ${Math.round(daysUntilDue)} dia(s).`,
          cardId: card.id,
          dismissible: true,
        });
      }
    }

    if (card.blockedBy && card.blockedBy.length > 0) {
      const blockerIds = card.blockedBy;
      const blockerTitles = blockerIds
        .map((bid) => cards.find((bc) => bc.id === bid))
        .filter(Boolean)
        .map((bc) => bc!.title);
      if (blockerTitles.length > 0) {
        nudges.push({
          id: `blocked:${card.id}`,
          type: "blocked_chain",
          severity: "warning",
          message: `Card "${card.title}" está bloqueado por: ${blockerTitles.join(", ")}`,
          cardId: card.id,
          dismissible: true,
        });
      }
    }
  }

  for (const col of columns) {
    if (col.wipLimit && col.wipLimit > 0) {
      const colCards = activeCards.filter((c) => c.bucket === col.key || c.bucket === col.label);
      if (colCards.length > col.wipLimit) {
        nudges.push({
          id: `wip:${col.key}`,
          type: "wip_limit_exceeded",
          severity: "warning",
          message: `Coluna "${col.label}" excede o limite WIP: ${colCards.length}/${col.wipLimit} cards.`,
          column: col.key,
          dismissible: true,
        });
      }
    }
  }

  const assigneeCounts = new Map<string, number>();
  for (const card of activeCards) {
    if (card.assignee) {
      assigneeCounts.set(card.assignee, (assigneeCounts.get(card.assignee) || 0) + 1);
    }
  }
  if (assigneeCounts.size >= 2) {
    const counts = [...assigneeCounts.values()];
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max > min * 2.5 && max >= 4) {
      nudges.push({
        id: "workload:imbalance",
        type: "unbalanced_workload",
        severity: "info",
        message: `Carga de trabalho desbalanceada: distribuição varia de ${min} a ${max} cards por membro.`,
        dismissible: true,
      });
    }
  }

  nudges.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return nudges.slice(0, maxNudges);
}
