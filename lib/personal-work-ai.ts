const DAY_MS = 24 * 60 * 60 * 1000;

export type PersonalCardSummary = {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  bucket: string;
  priority: string;
  progress: string;
  dueDate: string | null;
  blockedBy: string[];
  storyPoints: number | null;
  columnEnteredAt: string | null;
};

export type WorkPrioritySuggestion = {
  cardId: string;
  reason: string;
  urgencyScore: number;
};

export type PersonalWorkloadStats = {
  totalAssigned: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  dueSoon: number;
  completedThisWeek: number;
  weeklyThroughput: number[];
};

export function computePersonalWorkload(
  assignedCards: PersonalCardSummary[],
  completedDates: string[]
): PersonalWorkloadStats {
  const now = Date.now();
  const weekStart = now - 7 * DAY_MS;

  let inProgress = 0;
  let blocked = 0;
  let overdue = 0;
  let dueSoon = 0;

  for (const card of assignedCards) {
    if (card.progress === "Em andamento") inProgress++;
    if (card.blockedBy.length > 0) blocked++;
    if (card.dueDate) {
      const dueMs = new Date(card.dueDate).getTime();
      if (dueMs < now) overdue++;
      else if ((dueMs - now) / DAY_MS < 3) dueSoon++;
    }
  }

  const completedThisWeek = completedDates.filter((d) => new Date(d).getTime() >= weekStart).length;

  const weeklyThroughput: number[] = [];
  for (let w = 0; w < 4; w++) {
    const wEnd = now - w * 7 * DAY_MS;
    const wStart = wEnd - 7 * DAY_MS;
    const count = completedDates.filter((d) => {
      const ms = new Date(d).getTime();
      return ms >= wStart && ms < wEnd;
    }).length;
    weeklyThroughput.push(count);
  }

  return {
    totalAssigned: assignedCards.length,
    inProgress,
    blocked,
    overdue,
    dueSoon,
    completedThisWeek,
    weeklyThroughput: weeklyThroughput.reverse(),
  };
}

export function suggestWorkPriority(
  cards: PersonalCardSummary[]
): WorkPrioritySuggestion[] {
  const now = Date.now();
  const suggestions: WorkPrioritySuggestion[] = [];

  for (const card of cards) {
    if (card.progress === "Concluída") continue;

    let urgencyScore = 0;
    const reasons: string[] = [];

    const priorityWeight: Record<string, number> = {
      "Urgente": 40,
      "Importante": 25,
      "Média": 10,
    };
    urgencyScore += priorityWeight[card.priority] ?? 10;
    if (card.priority === "Urgente") reasons.push("prioridade urgente");

    if (card.dueDate) {
      const daysUntilDue = (new Date(card.dueDate).getTime() - now) / DAY_MS;
      if (daysUntilDue < 0) {
        urgencyScore += 30;
        reasons.push("atrasado");
      } else if (daysUntilDue < 2) {
        urgencyScore += 20;
        reasons.push("vence em breve");
      } else if (daysUntilDue < 5) {
        urgencyScore += 10;
        reasons.push("deadline próximo");
      }
    }

    if (card.blockedBy.length > 0) {
      urgencyScore -= 10;
      reasons.push("bloqueado");
    }

    if (card.progress === "Em andamento") {
      urgencyScore += 5;
      reasons.push("em andamento");
    }

    if (card.columnEnteredAt) {
      const daysInColumn = (now - new Date(card.columnEnteredAt).getTime()) / DAY_MS;
      if (daysInColumn > 7) {
        urgencyScore += 10;
        reasons.push("parado há muito tempo");
      }
    }

    suggestions.push({
      cardId: card.id,
      reason: reasons.join(", ") || "tarefa pendente",
      urgencyScore: Math.max(0, Math.min(100, urgencyScore)),
    });
  }

  suggestions.sort((a, b) => b.urgencyScore - a.urgencyScore);
  return suggestions;
}
