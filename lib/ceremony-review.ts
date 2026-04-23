import type { SprintData } from "@/lib/schemas";
import type { BoardData } from "@/lib/kv-boards";
import { sprintDeliveredVsCommitment } from "@/lib/sprint-delivery-metrics";
import type { Organization } from "@/lib/kv-organizations";
import { createOpenAiCompatProvider } from "@/lib/llm-provider";
import { resolveOrgLlmRuntime } from "@/lib/org-llm-runtime";

export type ReviewDemoItem = {
  cardId: string;
  title: string;
  demoed: boolean;
  notes: string;
};

export type SprintReviewOutput = {
  sprintName: string;
  summary: string;
  velocityVsCommitment: { commitment: number; delivered: number; pct: number };
  demoItems: ReviewDemoItem[];
  stakeholderSummary: string;
  improvements: string[];
  generatedAt: string;
};

export async function generateSprintReview(params: {
  sprint: SprintData;
  board: BoardData;
  org: Organization | null;
}): Promise<SprintReviewOutput> {
  const { sprint, board, org } = params;
  const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];
  const doneCards = sprint.doneCardIds.map((id) => cards.find((c) => c.id === id)).filter(Boolean) as Array<Record<string, unknown>>;
  const { commitment, delivered, pct } = sprintDeliveredVsCommitment(sprint, doneCards.length);

  const demoList = doneCards.slice(0, 12).map((c) => ({
    cardId: String(c.id ?? ""),
    title: String(c.title ?? "").slice(0, 100),
    priority: String(c.priority ?? ""),
  }));

  const prompt = `Você é um Scrum Master IA auxiliando na Sprint Review. Gere um relatório executivo em português brasileiro.

Sprint: "${sprint.name}"
Meta: "${sprint.goal || "(sem meta)"}"
Comprometimento: ${commitment} cards | Entregues: ${delivered} (${pct}%)

Cards entregues (potenciais demos):
${demoList.map((c, i) => `${i + 1}. [${c.cardId}] "${c.title}" (${c.priority})`).join("\n") || "Nenhum"}

Gere um relatório de review. Responda em JSON válido:
{
  "summary": "resumo executivo de 2-3 frases",
  "stakeholderSummary": "resumo para stakeholders não técnicos de 2-4 frases",
  "improvements": ["melhoria 1", "melhoria 2", "melhoria 3"]
}`;

  const demoItems: ReviewDemoItem[] = doneCards.slice(0, 12).map((c) => ({
    cardId: String(c.id ?? ""),
    title: String(c.title ?? "").slice(0, 100),
    demoed: false,
    notes: "",
  }));

  try {
    const runtime = resolveOrgLlmRuntime(org);
    if (!runtime) throw new Error("no_api_key");
    const provider = createOpenAiCompatProvider(runtime);
    const result = await provider.chat(
      [{ role: "user", content: prompt }],
      undefined,
      { maxTokens: 800, temperature: 0.4 }
    );
    if (!result.ok) throw new Error(result.error);
    const jsonMatch = result.assistantText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; stakeholderSummary?: string; improvements?: string[] };

    return {
      sprintName: sprint.name,
      summary: String(parsed.summary ?? `Sprint ${sprint.name}: ${pct}% do comprometimento entregue.`).trim().slice(0, 600),
      velocityVsCommitment: { commitment, delivered, pct },
      demoItems,
      stakeholderSummary: String(parsed.stakeholderSummary ?? "").trim().slice(0, 600),
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map((s) => String(s).trim().slice(0, 300)).slice(0, 5) : [],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      sprintName: sprint.name,
      summary: `Sprint ${sprint.name}: ${delivered}/${commitment} cards entregues (${pct}%).`,
      velocityVsCommitment: { commitment, delivered, pct },
      demoItems,
      stakeholderSummary: `O time completou ${delivered} de ${commitment} itens planejados (${pct}%) durante o sprint "${sprint.name}".`,
      improvements: ["Revisar processo de estimativa", "Endereçar bloqueios mais rapidamente", "Melhorar definição de done"],
      generatedAt: new Date().toISOString(),
    };
  }
}
