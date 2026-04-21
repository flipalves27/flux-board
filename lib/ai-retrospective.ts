const DAY_MS = 24 * 60 * 60 * 1000;

export type RetroItemCategory = "went_well" | "improvement" | "action";
export type RetroActionCategory = "process" | "team" | "technical" | "quality";

export type RetroItem = {
  id: string;
  category: RetroItemCategory;
  text: string;
  subText?: string;
};

export type RetroAction = {
  id: string;
  text: string;
  actionCategory: RetroActionCategory;
  suggestedOwner?: string;
  priority: "high" | "medium" | "low";
};

export type RetroMetrics = {
  plannedCards: number;
  completedCards: number;
  completionRate: number;
  carryoverCards: number;
  blockedCards: number;
  avgCycleTimeDays: number | null;
  scopeAddedDuringSprint: number;
  velocityVsPrev: number | null;
};

export type RetrospectiveResult = {
  sprintName: string;
  sprintGoal?: string;
  metrics: RetroMetrics;
  wentWell: RetroItem[];
  improvements: RetroItem[];
  actions: RetroAction[];
  llmNarrative?: string;
  generatedAt: string;
};

type CardLike = {
  id: string;
  title: string;
  bucket: string;
  progress: string;
  priority?: string;
  columnEnteredAt?: string;
  dueDate?: string | null;
  blockedBy?: string[];
  assignee?: string;
  assigneeId?: string;
};

type SprintLike = {
  id: string;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  plannedCapacity?: number;
  cardIds?: string[];
  doneCardIds?: string[];
};

function avgCycleTime(cards: CardLike[], sprintStart: Date | null): number | null {
  if (!sprintStart) return null;
  const cycleTimes: number[] = [];
  for (const c of cards) {
    if (c.progress !== "Concluída") continue;
    const completedAt = (c as Record<string, unknown>).completedAt;
    if (!completedAt || typeof completedAt !== "string") continue;
    const ct = (new Date(completedAt).getTime() - sprintStart.getTime()) / DAY_MS;
    if (ct > 0 && ct < 60) cycleTimes.push(ct);
  }
  if (cycleTimes.length === 0) return null;
  return Math.round((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 10) / 10;
}

export function computeRetrospective(
  sprint: SprintLike,
  allCards: CardLike[],
  prevSprintVelocity?: number | null
): RetrospectiveResult {
  const sprintStart = sprint.startDate ? new Date(sprint.startDate) : null;
  const sprintEnd = sprint.endDate ? new Date(sprint.endDate) : null;
  const sprintCardIds = new Set(sprint.cardIds ?? []);
  const doneCardIds = new Set(sprint.doneCardIds ?? []);

  const sprintCards = allCards.filter(
    (c) => sprintCardIds.has(c.id) || doneCardIds.has(c.id)
  );

  const completed = sprintCards.filter((c) => c.progress === "Concluída" || doneCardIds.has(c.id));
  const notCompleted = sprintCards.filter((c) => c.progress !== "Concluída" && !doneCardIds.has(c.id));
  const blocked = sprintCards.filter((c) => (c.blockedBy?.length ?? 0) > 0);

  // Scope added during sprint (cards not in original planned set)
  const scopeAdded = sprint.cardIds ? sprintCards.filter((c) => {
    const plannedIds = sprint.doneCardIds ?? [];
    return !plannedIds.includes(c.id) && c.progress === "Concluída";
  }).length : 0;

  const completionRate =
    sprintCards.length > 0 ? Math.round((completed.length / sprintCards.length) * 100) : 0;

  const metrics: RetroMetrics = {
    plannedCards: sprintCards.length,
    completedCards: completed.length,
    completionRate,
    carryoverCards: notCompleted.length,
    blockedCards: blocked.length,
    avgCycleTimeDays: avgCycleTime(sprintCards, sprintStart),
    scopeAddedDuringSprint: scopeAdded,
    velocityVsPrev:
      prevSprintVelocity != null && prevSprintVelocity > 0
        ? Math.round(((completed.length - prevSprintVelocity) / prevSprintVelocity) * 100)
        : null,
  };

  const wentWell: RetroItem[] = [];
  const improvements: RetroItem[] = [];
  const actions: RetroAction[] = [];

  // Went well
  if (completionRate >= 85) {
    wentWell.push({
      id: "high_completion",
      category: "went_well",
      text: `Alta taxa de conclusão (${completionRate}%)`,
      subText: "O time entregou quase tudo que planejou neste sprint.",
    });
  }
  if (blocked.length === 0) {
    wentWell.push({
      id: "no_blockers",
      category: "went_well",
      text: "Nenhum card bloqueado",
      subText: "O fluxo de trabalho foi fluido sem impedimentos formais.",
    });
  }
  if (metrics.velocityVsPrev !== null && metrics.velocityVsPrev > 0) {
    wentWell.push({
      id: "velocity_up",
      category: "went_well",
      text: `Velocidade ${metrics.velocityVsPrev}% acima do sprint anterior`,
      subText: `Entregou ${completed.length} cards vs. ${prevSprintVelocity} no sprint anterior.`,
    });
  }
  if (scopeAdded === 0) {
    wentWell.push({
      id: "no_scope_creep",
      category: "went_well",
      text: "Escopo mantido sem adições no sprint",
      subText: "O time respeitou o comprometimento original.",
    });
  }

  // Improvements
  if (completionRate < 70) {
    improvements.push({
      id: "low_completion",
      category: "improvement",
      text: `Apenas ${completionRate}% do sprint foi concluído`,
      subText: `${notCompleted.length} cards foram carregados para o próximo sprint.`,
    });
  }
  if (blocked.length >= 2) {
    improvements.push({
      id: "blockers",
      category: "improvement",
      text: `${blocked.length} cards tiveram bloqueios`,
      subText: "Bloqueios frequentes indicam dependências mal mapeadas ou falta de comunicação.",
    });
  }
  if (metrics.velocityVsPrev !== null && metrics.velocityVsPrev < -15) {
    improvements.push({
      id: "velocity_down",
      category: "improvement",
      text: `Velocidade caiu ${Math.abs(metrics.velocityVsPrev)}% vs. sprint anterior`,
      subText: "Investigue causas: aumento de complexidade, interrupções ou problemas técnicos.",
    });
  }
  if (scopeAdded >= 3) {
    improvements.push({
      id: "scope_creep",
      category: "improvement",
      text: `${scopeAdded} cards adicionados durante o sprint (scope creep)`,
      subText: "Adições frequentes ao escopo reduzem previsibilidade e desgastam o time.",
    });
  }
  if (metrics.avgCycleTimeDays !== null && metrics.avgCycleTimeDays > 5) {
    improvements.push({
      id: "long_cycle",
      category: "improvement",
      text: `Tempo médio de ciclo alto: ${metrics.avgCycleTimeDays} dias`,
      subText: "Cards demoram muito para fluir. Considere quebrar tarefas grandes em menores.",
    });
  }

  // Actions
  if (completionRate < 80) {
    actions.push({
      id: "reduce_scope",
      text: "Reduzir escopo comprometido em ~20% no próximo sprint para aumentar previsibilidade",
      actionCategory: "process",
      priority: "high",
    });
  }
  if (blocked.length >= 2) {
    actions.push({
      id: "map_dependencies",
      text: "Mapear dependências externas antes do planning e definir DRI para cada bloqueio potencial",
      actionCategory: "process",
      priority: "high",
      suggestedOwner: "Scrum Master",
    });
  }
  if (scopeAdded >= 3) {
    actions.push({
      id: "freeze_sprint",
      text: "Implementar regra de congelamento de escopo após 2º dia do sprint",
      actionCategory: "process",
      priority: "medium",
      suggestedOwner: "Product Owner",
    });
  }
  if (metrics.avgCycleTimeDays !== null && metrics.avgCycleTimeDays > 5) {
    actions.push({
      id: "break_tasks",
      text: "Definir critério de tamanho máximo: nenhum card deve levar mais de 3 dias",
      actionCategory: "technical",
      priority: "medium",
    });
  }
  if (notCompleted.length > 0) {
    actions.push({
      id: "review_carryover",
      text: `Revisar os ${notCompleted.length} cards carregados: repriorizar ou subdividir antes do próximo planning`,
      actionCategory: "process",
      priority: "high",
      suggestedOwner: "Product Owner",
    });
  }

  if (wentWell.length === 0) {
    wentWell.push({
      id: "effort",
      category: "went_well",
      text: "Time dedicado e presente",
      subText: "Independente dos resultados, o engajamento foi positivo.",
    });
  }

  return {
    sprintName: sprint.name,
    sprintGoal: sprint.goal,
    metrics,
    wentWell: wentWell.slice(0, 4),
    improvements: improvements.slice(0, 4),
    actions: actions.slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
}

export function buildRetroPrompt(
  result: Omit<RetrospectiveResult, "llmNarrative">,
  locale: string
): string {
  const lang = locale.startsWith("pt") ? "português brasileiro" : "English";
  return `Você é um Agile Coach experiente facilitando uma retrospectiva. Em ${lang}, escreva um parágrafo narrativo (5-6 linhas) resumindo o sprint "${result.sprintName}".

Métricas: ${result.metrics.completedCards}/${result.metrics.plannedCards} cards concluídos (${result.metrics.completionRate}%), ${result.metrics.carryoverCards} carregados, ${result.metrics.blockedCards} bloqueios${result.metrics.velocityVsPrev != null ? `, velocidade ${result.metrics.velocityVsPrev > 0 ? "+" : ""}${result.metrics.velocityVsPrev}% vs. sprint anterior` : ""}.

Pontos positivos: ${result.wentWell.map((w) => w.text).join("; ")}
Pontos de melhoria: ${result.improvements.map((i) => i.text).join("; ")}
Ações prioritárias: ${result.actions.filter((a) => a.priority === "high").map((a) => a.text).join("; ")}

Seja honesto, encorajador e específico. Mencione padrões observados. Termine com uma frase motivadora para o próximo sprint.`;
}
