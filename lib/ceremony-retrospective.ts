import type { SprintData } from "@/lib/schemas";
import type { BoardData } from "@/lib/kv-boards";
import { sprintDeliveredVsCommitment } from "@/lib/sprint-delivery-metrics";
import type { Organization } from "@/lib/kv-organizations";
import { resolveBatchLlmRoute } from "@/lib/org-ai-routing";
import { createTogetherProvider, createAnthropicProvider } from "@/lib/llm-provider";

export type RetroItem = {
  id: string;
  category: "went_well" | "improve" | "action";
  text: string;
  votes: number;
  aiGenerated: boolean;
};

export type RetroOutput = {
  sprintName: string;
  summary: string;
  wentWell: RetroItem[];
  improve: RetroItem[];
  actions: RetroItem[];
  generatedAt: string;
};

function mkId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export type CeremonyMode = "sprint" | "kanban";

export type FlowReviewType = "flow_review" | "service_delivery_review" | "replenishment" | "retro_de_fluxo";

export async function generateRetrospective(params: {
  sprint: SprintData;
  board: BoardData;
  org: Organization | null;
  mode?: CeremonyMode;
}): Promise<RetroOutput> {
  const { sprint, board, org, mode = "sprint" } = params;
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

  const prompt = `Você é um Scrum Master IA facilitando uma retrospectiva ágil ${isKanban ? "Kanban (análise de fluxo)" : "de sprint"} para a equipe. Analise o ${periodLabel} e gere insights construtivos em português brasileiro.

${isKanban ? "Período" : "Sprint"}: "${sprint.name}"
${isKanban ? "Objetivo" : "Meta"}: "${sprint.goal || "(sem meta definida)"}"
Período: ${sprint.startDate ?? "?"} → ${sprint.endDate ?? "?"}
${isKanban ? "Cards processados" : "Comprometimento"}: ${commitment} cards | Entregues: ${velocity} (${commitmentPct}%)

Cards concluídos:
${doneList || "Nenhum"}

Cards não concluídos:
${notDoneList || "Nenhum"}

Gere uma retrospectiva com no mínimo 3 itens por categoria. Responda em JSON válido:
{
  "summary": "resumo do sprint em 1-2 frases",
  "wentWell": [{"text": "o que funcionou bem..."}],
  "improve": [{"text": "o que pode melhorar..."}],
  "actions": [{"text": "ação concreta: quem + o quê + quando..."}]
}
Cada item deve ser específico e acionável. Máximo 6 itens por categoria.`;

  try {
    const { route } = resolveBatchLlmRoute(org);
    const provider = route === "anthropic" ? createAnthropicProvider() : createTogetherProvider();
    const result = await provider.chat(
      [{ role: "user", content: prompt }],
      undefined,
      { maxTokens: 1200, temperature: 0.5 }
    );

    if (!result.ok) throw new Error(result.error);
    const jsonMatch = result.assistantText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON not found");

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      wentWell?: Array<{ text: string }>;
      improve?: Array<{ text: string }>;
      actions?: Array<{ text: string }>;
    };

    const makeItems = (arr: Array<{ text: string }> = [], cat: RetroItem["category"]): RetroItem[] =>
      arr.slice(0, 6).map((item) => ({
        id: mkId(),
        category: cat,
        text: String(item.text ?? "").trim().slice(0, 500),
        votes: 0,
        aiGenerated: true,
      })).filter((i) => i.text.length > 0);

    return {
      sprintName: sprint.name,
      summary: String(parsed.summary ?? `Sprint ${sprint.name}: ${commitmentPct}% do comprometimento entregue.`).trim().slice(0, 500),
      wentWell: makeItems(parsed.wentWell, "went_well"),
      improve: makeItems(parsed.improve, "improve"),
      actions: makeItems(parsed.actions, "action"),
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      sprintName: sprint.name,
      summary: `Sprint ${sprint.name}: ${velocity}/${commitment} cards entregues (${commitmentPct}%).`,
      wentWell: [{ id: mkId(), category: "went_well", text: `Equipe entregou ${velocity} cards no sprint.`, votes: 0, aiGenerated: false }],
      improve: [{ id: mkId(), category: "improve", text: `${notDoneCards.length} cards não foram concluídos — analisar causas.`, votes: 0, aiGenerated: false }],
      actions: [{ id: mkId(), category: "action", text: "Identificar e endereçar principais bloqueios na próxima sprint planning.", votes: 0, aiGenerated: false }],
      generatedAt: new Date().toISOString(),
    };
  }
}
