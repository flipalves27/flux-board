import type { BoardData } from "@/lib/kv-boards";
import type { Organization } from "@/lib/kv-organizations";
import { resolveBatchLlmRoute } from "@/lib/org-ai-routing";
import { createTogetherProvider, createAnthropicProvider } from "@/lib/llm-provider";

export type KanbanCadenceType =
  | "service_delivery_review"
  | "replenishment"
  | "flow_review"
  | "retro_de_fluxo";

export type KanbanFlowMetrics = {
  avgCycleTimeDays: number;
  throughputLastTwoWeeks: number;
  wipByColumn: Record<string, number>;
  blockedCount: number;
  oldestActiveCard: { title: string; daysActive: number } | null;
};

export type KanbanCadenceOutput = {
  type: KanbanCadenceType;
  title: string;
  summary: string;
  insights: Array<{ category: string; text: string }>;
  actions: Array<{ text: string; owner?: string; dueDate?: string }>;
  metrics: Partial<KanbanFlowMetrics>;
  generatedAt: string;
};

function computeFlowMetrics(board: BoardData): KanbanFlowMetrics {
  const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];
  const now = Date.now();

  const activeCards = cards.filter((c) => {
    const prog = String(c.progress ?? "");
    return !["Concluída", "Done", "Closed", "Cancelada"].includes(prog);
  });

  const wipByColumn: Record<string, number> = {};
  for (const c of activeCards) {
    const col = String(c.progress ?? "Unknown");
    wipByColumn[col] = (wipByColumn[col] ?? 0) + 1;
  }

  const blockedCount = activeCards.filter((c) => {
    const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
    return tags.some((t) => t.toLowerCase().includes("bloqueado") || t.toLowerCase().includes("blocked"));
  }).length;

  let oldest: { title: string; daysActive: number } | null = null;
  for (const c of activeCards) {
    if (c.createdAt) {
      const days = Math.floor((now - new Date(String(c.createdAt)).getTime()) / 86400000);
      if (!oldest || days > oldest.daysActive) {
        oldest = { title: String(c.title ?? "").slice(0, 80), daysActive: days };
      }
    }
  }

  const doneCards = cards.filter((c) => {
    const prog = String(c.progress ?? "");
    return ["Concluída", "Done", "Closed"].includes(prog);
  });

  const twoWeeksAgo = now - 14 * 86400000;
  const throughput = doneCards.filter((c) => {
    if (!c.updatedAt) return false;
    return new Date(String(c.updatedAt)).getTime() > twoWeeksAgo;
  }).length;

  let totalCycle = 0;
  let cycleCount = 0;
  for (const c of doneCards) {
    if (c.createdAt && c.updatedAt) {
      const cycleDays = (new Date(String(c.updatedAt)).getTime() - new Date(String(c.createdAt)).getTime()) / 86400000;
      if (cycleDays > 0 && cycleDays < 180) {
        totalCycle += cycleDays;
        cycleCount++;
      }
    }
  }
  const avgCycleTimeDays = cycleCount > 0 ? Math.round(totalCycle / cycleCount) : 0;

  return { avgCycleTimeDays, throughputLastTwoWeeks: throughput, wipByColumn, blockedCount, oldestActiveCard: oldest };
}

const CADENCE_TITLES: Record<KanbanCadenceType, string> = {
  service_delivery_review: "Service Delivery Review",
  replenishment: "Reunião de Reposição",
  flow_review: "Revisão de Fluxo",
  retro_de_fluxo: "Retrospectiva de Fluxo",
};

function buildCadencePrompt(type: KanbanCadenceType, board: BoardData, metrics: KanbanFlowMetrics): string {
  const wipSummary = Object.entries(metrics.wipByColumn)
    .map(([col, count]) => `  ${col}: ${count} cards`)
    .join("\n") || "  (sem dados)";

  const sharedContext = `Board: "${String(board.name ?? "")}"
Ciclo médio: ${metrics.avgCycleTimeDays} dias
Throughput (últimas 2 semanas): ${metrics.throughputLastTwoWeeks} cards
Cards bloqueados: ${metrics.blockedCount}
WIP por coluna:
${wipSummary}
${metrics.oldestActiveCard ? `Card mais antigo ativo: "${metrics.oldestActiveCard.title}" (${metrics.oldestActiveCard.daysActive} dias)` : ""}`;

  const instructions: Record<KanbanCadenceType, string> = {
    service_delivery_review: `Você é um Kanban Coach IA conduzindo uma Service Delivery Review.
Foco: Avaliar se o serviço está entregando valor ao cliente. Analise métricas de fluxo e gere recomendações.

${sharedContext}

Gere uma análise com insights sobre:
- Velocidade de entrega de valor ao cliente
- Gargalos identificados
- SLA e acordos de nível de serviço
- Ações para melhorar a entrega`,

    replenishment: `Você é um Kanban Coach IA conduzindo uma Reunião de Reposição (Replenishment Meeting).
Foco: Priorizar e selecionar trabalho para o backlog. Evitar sobrecarga.

${sharedContext}

Gere recomendações sobre:
- Capacidade atual da equipe (baseado no WIP)
- Itens prioritários a repor no fluxo
- Limites WIP recomendados por coluna
- Riscos de sobrecarga`,

    flow_review: `Você é um Kanban Coach IA conduzindo uma Revisão de Fluxo (Flow Review).
Foco: Avaliar saúde do fluxo e identificar impedimentos sistêmicos.

${sharedContext}

Gere análise de:
- Eficiência do fluxo atual
- Aging WIP e possíveis abandonos
- Impedimentos sistêmicos recorrentes
- Oportunidades de melhoria de processo`,

    retro_de_fluxo: `Você é um Kanban Coach IA facilitando uma Retrospectiva de Fluxo.
Foco: Reflexão sobre o processo Kanban e melhorias no sistema de trabalho.

${sharedContext}

Gere retrospectiva com:
- O que está funcionando bem no fluxo
- Problemas recorrentes de processo
- Experimentos de melhoria a tentar
- Acordos de equipe a revisar`,
  };

  return `${instructions[type]}

Responda APENAS em JSON válido:
{
  "summary": "resumo executivo em 2-3 frases",
  "insights": [
    {"category": "categoria", "text": "insight específico e acionável"}
  ],
  "actions": [
    {"text": "ação concreta: o quê + quem + quando", "owner": "opcional", "dueDate": "opcional YYYY-MM-DD"}
  ]
}
Máximo 6 insights e 5 ações. Todos em português brasileiro.`;
}

export async function generateKanbanCadence(params: {
  board: BoardData;
  org: Organization | null;
  type: KanbanCadenceType;
}): Promise<KanbanCadenceOutput> {
  const { board, org, type } = params;
  const metrics = computeFlowMetrics(board);
  const prompt = buildCadencePrompt(type, board, metrics);

  try {
    const { route } = resolveBatchLlmRoute(org);
    const provider = route === "anthropic" ? createAnthropicProvider() : createTogetherProvider();
    const result = await provider.chat(
      [{ role: "user", content: prompt }],
      undefined,
      { maxTokens: 1000, temperature: 0.4 }
    );

    if (!result.ok) throw new Error(result.error);
    const jsonMatch = result.assistantText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON not found");

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      insights?: Array<{ category: string; text: string }>;
      actions?: Array<{ text: string; owner?: string; dueDate?: string }>;
    };

    return {
      type,
      title: CADENCE_TITLES[type],
      summary: String(parsed.summary ?? "").slice(0, 800),
      insights: (parsed.insights ?? []).slice(0, 6).map((i) => ({
        category: String(i.category ?? "").slice(0, 60),
        text: String(i.text ?? "").slice(0, 500),
      })),
      actions: (parsed.actions ?? []).slice(0, 5).map((a) => ({
        text: String(a.text ?? "").slice(0, 400),
        owner: a.owner ? String(a.owner).slice(0, 100) : undefined,
        dueDate: a.dueDate ? String(a.dueDate).slice(0, 30) : undefined,
      })),
      metrics: {
        avgCycleTimeDays: metrics.avgCycleTimeDays,
        throughputLastTwoWeeks: metrics.throughputLastTwoWeeks,
        wipByColumn: metrics.wipByColumn,
        blockedCount: metrics.blockedCount,
        oldestActiveCard: metrics.oldestActiveCard,
      },
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return {
      type,
      title: CADENCE_TITLES[type],
      summary: `Não foi possível gerar a análise automaticamente: ${message}`,
      insights: [{ category: "Aviso", text: "Análise manual necessária. Verifique os dados do board." }],
      actions: [],
      metrics: {
        avgCycleTimeDays: metrics.avgCycleTimeDays,
        throughputLastTwoWeeks: metrics.throughputLastTwoWeeks,
        wipByColumn: metrics.wipByColumn,
        blockedCount: metrics.blockedCount,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
