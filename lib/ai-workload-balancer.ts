import type { BoardData } from "@/lib/kv-boards";
import type { Organization } from "@/lib/kv-organizations";
import { resolveBatchLlmRoute } from "@/lib/org-ai-routing";
import { createTogetherProvider, createAnthropicProvider } from "@/lib/llm-provider";

export type WorkloadEntry = {
  memberId: string;
  memberName: string;
  cardCount: number;
  highPriorityCount: number;
  blockedCount: number;
  estimatedLoadScore: number;
};

export type WorkloadSuggestion = {
  fromMember: string;
  toMember: string;
  cardId: string;
  cardTitle: string;
  reason: string;
};

export type WorkloadBalancerOutput = {
  entries: WorkloadEntry[];
  overloadedMembers: string[];
  underutilizedMembers: string[];
  suggestions: WorkloadSuggestion[];
  summary: string;
  generatedAt: string;
};

export function computeWorkloadEntries(board: BoardData): WorkloadEntry[] {
  const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];
  const memberMap = new Map<string, WorkloadEntry>();

  for (const card of cards) {
    const assignees = Array.isArray(card.assignees) ? (card.assignees as string[]) : [];
    const assignee = typeof card.assignee === "string" ? card.assignee : assignees[0];
    if (!assignee) continue;

    const prog = String(card.progress ?? "");
    const isDone = ["Concluída", "Done", "Closed", "Cancelada"].includes(prog);
    if (isDone) continue;

    const entry = memberMap.get(assignee) ?? {
      memberId: assignee,
      memberName: assignee,
      cardCount: 0,
      highPriorityCount: 0,
      blockedCount: 0,
      estimatedLoadScore: 0,
    };

    entry.cardCount++;
    const prio = String(card.priority ?? "").toLowerCase();
    if (prio === "critical" || prio === "alta" || prio === "high") entry.highPriorityCount++;

    const tags = Array.isArray(card.tags) ? (card.tags as string[]) : [];
    if (tags.some((t) => t.toLowerCase().includes("bloqueado") || t.toLowerCase().includes("blocked"))) {
      entry.blockedCount++;
    }

    entry.estimatedLoadScore = entry.cardCount * 10 + entry.highPriorityCount * 5 + entry.blockedCount * 3;
    memberMap.set(assignee, entry);
  }

  return Array.from(memberMap.values()).sort((a, b) => b.estimatedLoadScore - a.estimatedLoadScore);
}

export async function generateWorkloadBalance(params: {
  board: BoardData;
  org: Organization | null;
}): Promise<WorkloadBalancerOutput> {
  const { board, org } = params;
  const entries = computeWorkloadEntries(board);

  if (entries.length === 0) {
    return {
      entries: [],
      overloadedMembers: [],
      underutilizedMembers: [],
      suggestions: [],
      summary: "Nenhum card atribuído encontrado para análise de workload.",
      generatedAt: new Date().toISOString(),
    };
  }

  const avgScore = entries.reduce((s, e) => s + e.estimatedLoadScore, 0) / entries.length;
  const overloaded = entries.filter((e) => e.estimatedLoadScore > avgScore * 1.5).map((e) => e.memberName);
  const underutilized = entries.filter((e) => e.estimatedLoadScore < avgScore * 0.5).map((e) => e.memberName);

  const workloadSummary = entries.slice(0, 10).map((e) =>
    `${e.memberName}: ${e.cardCount} cards ativos, ${e.highPriorityCount} alta prioridade, ${e.blockedCount} bloqueados (score: ${e.estimatedLoadScore})`
  ).join("\n");

  const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];
  const activeCards = cards.filter((c) => !["Concluída", "Done", "Closed", "Cancelada"].includes(String(c.progress ?? "")));
  const cardSample = activeCards.slice(0, 15).map((c) => `- ID: ${c.id}, Título: "${String(c.title ?? "").slice(0, 60)}", Assignee: ${String(c.assignee ?? "sem responsável")}, Prioridade: ${c.priority ?? "normal"}`).join("\n");

  const prompt = `Você é um AI Workload Balancer para times ágeis. Analise a distribuição de trabalho e sugira rebalanceamento.

Board: "${String(board.name ?? "")}"

Distribuição atual de workload:
${workloadSummary}

Membros sobrecarregados: ${overloaded.join(", ") || "nenhum"}
Membros subutilizados: ${underutilized.join(", ") || "nenhum"}

Cards ativos (amostra):
${cardSample}

Gere sugestões de rebalanceamento em JSON válido:
{
  "summary": "análise em 2-3 frases",
  "suggestions": [
    {
      "fromMember": "nome do membro sobrecarregado",
      "toMember": "nome do membro subutilizado",
      "cardId": "id do card",
      "cardTitle": "título do card",
      "reason": "justificativa"
    }
  ]
}
Máximo 5 sugestões. Em português brasileiro.`;

  try {
    const { route } = resolveBatchLlmRoute(org);
    const provider = route === "anthropic" ? createAnthropicProvider() : createTogetherProvider();
    const result = await provider.chat(
      [{ role: "user", content: prompt }],
      undefined,
      { maxTokens: 800, temperature: 0.3 }
    );

    if (!result.ok) throw new Error(result.error);
    const jsonMatch = result.assistantText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON not found");

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      suggestions?: Array<{ fromMember: string; toMember: string; cardId: string; cardTitle: string; reason: string }>;
    };

    return {
      entries,
      overloadedMembers: overloaded,
      underutilizedMembers: underutilized,
      suggestions: (parsed.suggestions ?? []).slice(0, 5).map((s) => ({
        fromMember: String(s.fromMember ?? "").slice(0, 100),
        toMember: String(s.toMember ?? "").slice(0, 100),
        cardId: String(s.cardId ?? "").slice(0, 200),
        cardTitle: String(s.cardTitle ?? "").slice(0, 200),
        reason: String(s.reason ?? "").slice(0, 500),
      })),
      summary: String(parsed.summary ?? "").slice(0, 800),
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return {
      entries,
      overloadedMembers: overloaded,
      underutilizedMembers: underutilized,
      suggestions: [],
      summary: `Análise automática indisponível: ${msg}`,
      generatedAt: new Date().toISOString(),
    };
  }
}
