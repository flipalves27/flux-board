import type { LlmChatMessage } from "@/lib/llm-provider";

export type TriageSuggestion = {
  priority: string | null;
  bucket: string | null;
  tags: string[];
  assignee: string | null;
  confidence: number;
  reasoning: string;
};

type CardSummary = { title: string; priority: string; bucket: string; tags: string[]; progress: string; assignee?: string };
type MemberSummary = { id: string; name: string; currentCards: number; recentBuckets: string[] };

function buildBoardContext(completedCards: CardSummary[], activeMembers: MemberSummary[], columns: string[]): string {
  const cardSample = completedCards.slice(0, 30).map((c) =>
    `- "${c.title}" → prioridade: ${c.priority}, coluna: ${c.bucket}, tags: [${c.tags.join(", ")}]`
  ).join("\n");

  const memberInfo = activeMembers.slice(0, 15).map((m) =>
    `- ${m.name} (id: ${m.id}): ${m.currentCards} cards ativos, trabalha em: [${m.recentBuckets.join(", ")}]`
  ).join("\n");

  return `Colunas do board: ${JSON.stringify(columns)}

Cards concluídos recentes (padrão do board):
${cardSample || "(nenhum)"}

Membros ativos:
${memberInfo || "(nenhum)"}`;
}

export function buildTriageMessages(
  cardTitle: string,
  cardDesc: string,
  completedCards: CardSummary[],
  activeMembers: MemberSummary[],
  columns: string[],
  priorities: string[]
): LlmChatMessage[] {
  const ctx = buildBoardContext(completedCards, activeMembers, columns);

  const system = `Você é um assistente de triagem inteligente para um board Kanban.
Analise o novo card e sugira a melhor classificação baseada no histórico do board.

Regras:
- priority: uma de ${JSON.stringify(priorities)}
- bucket: uma das colunas do board
- tags: reutilize tags existentes no board quando fizer sentido
- assignee: sugira o id do membro mais adequado (por carga e especialidade), ou null
- confidence: de 0 a 1 indicando confiança da sugestão
- reasoning: explicação curta (1-2 frases) da decisão

Responda APENAS com JSON válido:
{ "priority": "string", "bucket": "string", "tags": ["string"], "assignee": "string|null", "confidence": 0.0, "reasoning": "string" }`;

  return [
    { role: "system", content: system },
    { role: "user", content: `Contexto do board:\n${ctx}\n\nNovo card:\nTítulo: ${cardTitle}\nDescrição: ${cardDesc || "(sem descrição)"}` },
  ];
}

export function parseTriageResponse(text: string): TriageSuggestion | null {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    const obj = JSON.parse(cleaned);
    if (!obj || typeof obj !== "object") return null;

    return {
      priority: typeof obj.priority === "string" ? obj.priority : null,
      bucket: typeof obj.bucket === "string" ? obj.bucket : null,
      tags: Array.isArray(obj.tags) ? obj.tags.filter((t: unknown) => typeof t === "string").slice(0, 8) : [],
      assignee: typeof obj.assignee === "string" && obj.assignee.trim() ? obj.assignee.trim() : null,
      confidence: typeof obj.confidence === "number" ? Math.min(1, Math.max(0, obj.confidence)) : 0.5,
      reasoning: typeof obj.reasoning === "string" ? obj.reasoning.trim() : "",
    };
  } catch {
    return null;
  }
}

export function heuristicTriage(
  cardTitle: string,
  completedCards: CardSummary[],
  columns: string[],
  priorities: string[]
): TriageSuggestion {
  const titleLower = cardTitle.toLowerCase();

  let priority = priorities[priorities.length - 1] ?? "Média";
  if (titleLower.includes("urgente") || titleLower.includes("critical") || titleLower.includes("bug")) {
    priority = priorities[0] ?? "Urgente";
  } else if (titleLower.includes("importante") || titleLower.includes("important")) {
    priority = priorities[1] ?? "Importante";
  }

  const bucket = columns[0] ?? "Backlog";

  const tagFreq = new Map<string, number>();
  for (const card of completedCards) {
    for (const tag of card.tags) {
      tagFreq.set(tag, (tagFreq.get(tag) || 0) + 1);
    }
  }
  const topTags = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag]) => tag);

  return {
    priority,
    bucket,
    tags: topTags,
    assignee: null,
    confidence: 0.3,
    reasoning: "Classificação heurística baseada em palavras-chave do título.",
  };
}
