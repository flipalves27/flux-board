import { callFluxAi } from "@/lib/ai/gateway";
import type { SprintData } from "@/lib/schemas";
import type { BoardData } from "@/lib/kv-boards";
import { sprintDeliveredVsCommitment } from "@/lib/sprint-delivery-metrics";
import type { Organization } from "@/lib/kv-organizations";
import type { PlanGateContext } from "@/lib/plan-gates";

export type RetroItem = {
  id: string;
  category: string;
  text: string;
  votes: number;
  aiGenerated: boolean;
  priority?: "high" | "medium" | "low";
};

export type RetroFormat = "classic" | "start-stop-continue" | "4ls";

export type RetroOutput = {
  sprintName: string;
  summary: string;
  wentWell: RetroItem[];
  improve: RetroItem[];
  actions: RetroItem[];
  generatedAt: string;
  /** Modelos Start/Stop/Continue ou 4Ls — UI prioriza quando presente. */
  flexMode?: {
    format: "start-stop-continue" | "4ls";
    items: RetroItem[];
  };
};

function mkId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export type CeremonyMode = "sprint" | "kanban";

export type FlowReviewType = "flow_review" | "service_delivery_review" | "replenishment" | "retro_de_fluxo";

const RETRO_SYSTEM_CLASSIC = `Você é a Fluxy, assistente de IA do Flux Board especializada em agilidade.
Gere retrospectiva em português brasileiro, objetiva e construtiva, sem julgar pessoas.
Responda APENAS com um objeto JSON válido (sem markdown).`;

const RETRO_SYSTEM_FLEX = `Você é a Fluxy, assistente de IA do Flux Board especializada em agilidade.
Sua tarefa é gerar o rascunho de uma retrospectiva de sprint com base em dados quantitativos.
Escreva em português brasileiro. Seja objetiva, construtiva e encorajadora.
Evite julgamentos sobre pessoas. Foque em processos e padrões.
Retorne APENAS um JSON válido, sem markdown, no formato especificado.`;

function collectSprintContext(params: {
  sprint: SprintData;
  board: BoardData;
  mode: CeremonyMode;
}): {
  doneList: string;
  notDoneList: string;
  commitment: number;
  velocity: number;
  commitmentPct: number;
  notDoneCount: number;
  isKanban: boolean;
  periodLabel: string;
} {
  const { sprint, board, mode } = params;
  const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];
  const doneCards = sprint.doneCardIds.map((id) => cards.find((c) => c.id === id)).filter(Boolean) as Array<Record<string, unknown>>;
  const notDoneCards = sprint.cardIds
    .filter((id) => !sprint.doneCardIds.includes(id))
    .map((id) => cards.find((c) => c.id === id))
    .filter(Boolean) as Array<Record<string, unknown>>;

  const { commitment, delivered: velocity, pct: commitmentPct } = sprintDeliveredVsCommitment(sprint, doneCards.length);

  const doneList = doneCards.slice(0, 10).map((c) => `- "${String(c.title ?? "").slice(0, 80)}"`).join("\n");
  const notDoneList = notDoneCards.slice(0, 5).map((c) => `- "${String(c.title ?? "").slice(0, 80)}" (${String(c.priority ?? "")})`).join("\n");

  const isKanban = mode === "kanban";
  const periodLabel = isKanban ? "período analisado" : `sprint "${sprint.name}"`;

  return {
    doneList,
    notDoneList,
    commitment,
    velocity,
    commitmentPct,
    notDoneCount: notDoneCards.length,
    isKanban,
    periodLabel,
  };
}

function emptyClassicFallback(
  sprint: SprintData,
  ctx: ReturnType<typeof collectSprintContext>
): RetroOutput {
  return {
    sprintName: sprint.name,
    summary: `Sprint ${sprint.name}: ${ctx.velocity}/${ctx.commitment} cards entregues (${ctx.commitmentPct}%).`,
    wentWell: [
      {
        id: mkId(),
        category: "went_well",
        text: `Equipe entregou ${ctx.velocity} cards no sprint.`,
        votes: 0,
        aiGenerated: false,
      },
    ],
    improve: [
      {
        id: mkId(),
        category: "improve",
        text: `${ctx.notDoneCount} cards não foram concluídos — analisar causas.`,
        votes: 0,
        aiGenerated: false,
      },
    ],
    actions: [
      {
        id: mkId(),
        category: "action",
        text: "Identificar e endereçar principais bloqueios na próxima sprint planning.",
        votes: 0,
        aiGenerated: false,
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateRetrospective(params: {
  sprint: SprintData;
  board: BoardData;
  org: Organization | null;
  mode?: CeremonyMode;
  format?: RetroFormat;
  userId?: string | null;
  isAdmin?: boolean;
  planGateCtx?: PlanGateContext;
}): Promise<RetroOutput> {
  const { sprint, board, org, mode = "sprint", format = "classic" } = params;
  const orgId = org?._id ?? board.orgId;
  const ctx = collectSprintContext({ sprint, board, mode });

  if (format === "start-stop-continue" || format === "4ls") {
    const labels =
      format === "start-stop-continue"
        ? ["Start", "Stop", "Continue"]
        : ["Liked", "Learned", "Lacked", "Longed For"];

    const userPrompt = `Dados do sprint "${sprint.name}":
- Período: ${sprint.startDate ?? "?"} a ${sprint.endDate ?? "?"}
- ${ctx.isKanban ? "Cards processados" : "Comprometimento"}: ${ctx.commitment} | Concluídos: ${ctx.velocity} (${ctx.commitmentPct}%)
- Cards concluídos (amostra):
${ctx.doneList || "Nenhum"}
- Cards não concluídos (amostra):
${ctx.notDoneList || "Nenhum"}

Gere uma retrospectiva no formato "${format}" com pelo menos 2 itens por categoria (${labels.join(", ")}).
Retorne JSON no formato:
{
  "format": "${format}",
  "items": [
    { "category": "${labels[0]}", "text": "...", "priority": "high" },
    ...
  ],
  "summary": "Uma frase resumindo o sprint"
}
Valores de priority: high | medium | low.`;

    const ai = await callFluxAi({
      feature: "retro_assistant",
      orgId,
      userId: params.userId,
      isAdmin: params.isAdmin,
      mode: "batch",
      planGateCtx: params.planGateCtx,
      systemPrompt: RETRO_SYSTEM_FLEX,
      userPrompt,
      maxTokens: 1500,
      temperature: 0.45,
    });

    if (!ai.ok) {
      const base = emptyClassicFallback(sprint, ctx);
      return {
        ...base,
        flexMode: {
          format,
          items: labels.flatMap((cat) => [
            {
              id: mkId(),
              category: cat,
              text:
                cat === "Start" || cat === "Liked"
                  ? "Regenerar quando a API de IA estiver disponível."
                  : "Adicione itens manualmente enquanto a geração automática não responde.",
              votes: 0,
              aiGenerated: false,
            },
          ]),
        },
      };
    }

    try {
      const jsonMatch = ai.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON not found");
      const parsed = JSON.parse(jsonMatch[0]) as {
        summary?: string;
        items?: Array<{ category?: string; text?: string; priority?: string }>;
      };
      const items: RetroItem[] = (parsed.items ?? [])
        .slice(0, 24)
        .map((row) => ({
          id: mkId(),
          category: String(row.category ?? "").trim() || labels[0],
          text: String(row.text ?? "").trim().slice(0, 500),
          votes: 0,
          aiGenerated: true,
          priority: (["high", "medium", "low"].includes(String(row.priority))
            ? row.priority
            : undefined) as RetroItem["priority"],
        }))
        .filter((i) => i.text.length > 0);

      return {
        sprintName: sprint.name,
        summary: String(parsed.summary ?? `Sprint ${sprint.name}: ${ctx.commitmentPct}% do comprometimento.`).trim().slice(0, 500),
        wentWell: [],
        improve: [],
        actions: [],
        generatedAt: new Date().toISOString(),
        flexMode: {
          format,
          items: items.length
            ? items
            : labels.flatMap((cat) => [
                {
                  id: mkId(),
                  category: cat,
                  text: `Adicione aqui um item de "${cat}" com base na conversa do time.`,
                  votes: 0,
                  aiGenerated: false,
                },
              ]),
        },
      };
    } catch {
      const base = emptyClassicFallback(sprint, ctx);
      return {
        ...base,
        flexMode: {
          format,
          items: labels.map((cat) => ({
            id: mkId(),
            category: cat,
            text: "Não foi possível interpretar a resposta da IA — use Regenerar ou edite manualmente.",
            votes: 0,
            aiGenerated: false,
          })),
        },
      };
    }
  }

  const prompt = `Você é um Scrum Master IA facilitando uma retrospectiva ágil ${ctx.isKanban ? "Kanban (análise de fluxo)" : "de sprint"} para a equipe. Analise o ${ctx.periodLabel} e gere insights construtivos em português brasileiro.

${ctx.isKanban ? "Período" : "Sprint"}: "${sprint.name}"
${ctx.isKanban ? "Objetivo" : "Meta"}: "${sprint.goal || "(sem meta definida)"}"
Período: ${sprint.startDate ?? "?"} → ${sprint.endDate ?? "?"}
${ctx.isKanban ? "Cards processados" : "Comprometimento"}: ${ctx.commitment} cards | Entregues: ${ctx.velocity} (${ctx.commitmentPct}%)

Cards concluídos:
${ctx.doneList || "Nenhum"}

Cards não concluídos:
${ctx.notDoneList || "Nenhum"}

Gere uma retrospectiva com no mínimo 3 itens por categoria. Responda em JSON válido:
{
  "summary": "resumo do sprint em 1-2 frases",
  "wentWell": [{"text": "o que funcionou bem..."}],
  "improve": [{"text": "o que pode melhorar..."}],
  "actions": [{"text": "ação concreta: quem + o quê + quando..."}]
}
Cada item deve ser específico e acionável. Máximo 6 itens por categoria.`;

  const ai = await callFluxAi({
    feature: "retro_assistant",
    orgId,
    userId: params.userId,
    isAdmin: params.isAdmin,
    mode: "batch",
    planGateCtx: params.planGateCtx,
    systemPrompt: RETRO_SYSTEM_CLASSIC,
    userPrompt: prompt,
    maxTokens: 1200,
    temperature: 0.5,
  });

  if (!ai.ok) {
    return emptyClassicFallback(sprint, ctx);
  }

  try {
    const jsonMatch = ai.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON not found");

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      wentWell?: Array<{ text: string }>;
      improve?: Array<{ text: string }>;
      actions?: Array<{ text: string }>;
    };

    const makeItems = (arr: Array<{ text: string }> = [], cat: string): RetroItem[] =>
      arr.slice(0, 6)
        .map((item) => ({
          id: mkId(),
          category: cat,
          text: String(item.text ?? "").trim().slice(0, 500),
          votes: 0,
          aiGenerated: true,
        }))
        .filter((i) => i.text.length > 0);

    return {
      sprintName: sprint.name,
      summary: String(parsed.summary ?? `Sprint ${sprint.name}: ${ctx.commitmentPct}% do comprometimento entregue.`).trim().slice(0, 500),
      wentWell: makeItems(parsed.wentWell, "went_well"),
      improve: makeItems(parsed.improve, "improve"),
      actions: makeItems(parsed.actions, "action"),
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return emptyClassicFallback(sprint, ctx);
  }
}
