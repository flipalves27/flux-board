import type { BoardData } from "@/lib/kv-boards";
import type { SprintData } from "@/lib/schemas";
import type { SprintPredictionPayload } from "@/lib/sprint-prediction-metrics";
import type { Organization } from "@/lib/kv-organizations";
import { resolveBatchLlmRoute } from "@/lib/org-ai-routing";
import { createTogetherProvider, createAnthropicProvider } from "@/lib/llm-provider";

export function countBoardCardsNotDone(board: BoardData): number {
  const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];
  return cards.filter((c) => String(c.progress ?? "") !== "Concluída").length;
}

export type SprintPlanningAiSuggestion = {
  summary: string;
  recommendedCardIds: string[];
  reasoning: string;
  capacityWarning: string | null;
  okrAlignmentNotes: string[];
};

export async function buildSprintPlanningAiSuggestion(params: {
  sprint: SprintData;
  board: BoardData;
  prediction: SprintPredictionPayload;
  org: Organization | null;
}): Promise<SprintPlanningAiSuggestion> {
  const { sprint, board, prediction, org } = params;

  const recommended = prediction.recommended.slice(0, 10);
  const notDoneLen = countBoardCardsNotDone(board);

  const p85 = Math.ceil(prediction.percentiles?.p85 ?? 0);
  const horizonLabel = `${prediction.horizonDays} dias`;

  const cardsList = recommended
    .map((r, i) => `${i + 1}. [${r.cardId}] "${r.title}" (${r.priority}, due: ${r.dueDate ?? "sem prazo"})`)
    .join("\n");

  const systemPrompt = `Você é o Sprint Planning IA do FluxBoard. Analise os dados do board e forneça sugestões de planejamento de sprint objetivas em português brasileiro.`;

  const userPrompt = `Sprint: "${sprint.name}"
Meta: ${sprint.goal || "(sem meta definida)"}
Período: ${sprint.startDate ?? "?"} → ${sprint.endDate ?? "?"}
Previsão Monte Carlo (P85) para ${horizonLabel}: ${p85} cards concluídos
Total de cards não concluídos no board: ${notDoneLen}

Cards mais recomendados (por prioridade × urgência × 1/tempo-ciclo):
${cardsList || "Nenhum card disponível"}

Responda em JSON válido com esta estrutura:
{
  "summary": "resumo de 1-2 frases sobre o planejamento",
  "recommendedCardIds": ["id1", "id2", ...] (máx. ${p85} IDs dos cards acima),
  "reasoning": "explicação da seleção em 2-3 frases",
  "capacityWarning": null ou "aviso se capacidade estiver comprometida",
  "okrAlignmentNotes": ["nota1"] (lista vazia se sem OKRs)
}`;

  try {
    const { route } = resolveBatchLlmRoute(org);
    const provider = route === "anthropic" ? createAnthropicProvider() : createTogetherProvider();
    const result = await provider.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      undefined,
      { maxTokens: 800, temperature: 0.3 }
    );

    if (!result.ok) throw new Error(result.error);

    const jsonMatch = result.assistantText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON não encontrado na resposta");

    const parsed = JSON.parse(jsonMatch[0]) as Partial<SprintPlanningAiSuggestion>;
    return {
      summary: String(parsed.summary ?? "Planejamento gerado com base em histórico de velocidade."),
      recommendedCardIds: Array.isArray(parsed.recommendedCardIds) ? parsed.recommendedCardIds.slice(0, p85 || 10) : recommended.map((r) => r.cardId),
      reasoning: String(parsed.reasoning ?? prediction.rationale),
      capacityWarning: parsed.capacityWarning ? String(parsed.capacityWarning) : null,
      okrAlignmentNotes: Array.isArray(parsed.okrAlignmentNotes) ? parsed.okrAlignmentNotes.map(String) : [],
    };
  } catch {
    return {
      summary: prediction.summaryLine,
      recommendedCardIds: recommended.map((r) => r.cardId).slice(0, p85 || 8),
      reasoning: prediction.rationale,
      capacityWarning: null,
      okrAlignmentNotes: [],
    };
  }
}
