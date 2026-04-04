import type { LlmChatMessage } from "@/lib/llm-provider";

export type CardWriterType = "feature" | "bug" | "tech_debt" | "spike" | "general";

export type CardWriterInput = {
  userPrompt: string;
  cardType: CardWriterType;
  boardColumns: string[];
  existingTags: string[];
  priorities: string[];
};

export type CardWriterOutput = {
  title: string;
  desc: string;
  tags: string[];
  priority: string;
  bucket: string;
  subtasks: Array<{ title: string }>;
  acceptanceCriteria: string[];
};

const TYPE_INSTRUCTIONS: Record<CardWriterType, string> = {
  feature: "Escreva como uma User Story clara: 'Como [persona], quero [ação] para [benefício]'. Inclua critérios de aceitação mensuráveis.",
  bug: "Descreva o bug com: Comportamento atual, Comportamento esperado, Passos para reproduzir. Priorize a correção.",
  tech_debt: "Descreva a dívida técnica: O que precisa ser refatorado/melhorado, por que é importante, e qual o impacto no sistema.",
  spike: "Descreva a investigação: O que precisa ser explorado, quais perguntas precisam ser respondidas, e qual o timebox sugerido.",
  general: "Escreva um card de tarefa claro e objetivo com descrição detalhada do que precisa ser feito.",
};

export function buildCardWriterMessages(input: CardWriterInput): LlmChatMessage[] {
  const { userPrompt, cardType, boardColumns, existingTags, priorities } = input;
  const typeInstr = TYPE_INSTRUCTIONS[cardType] || TYPE_INSTRUCTIONS.general;

  const system = `Você é um assistente especializado em gestão ágil de projetos.
Seu trabalho é transformar descrições informais em cards estruturados de alta qualidade.

Regras:
- ${typeInstr}
- O campo "bucket" deve ser uma das colunas: ${JSON.stringify(boardColumns)}.
- O campo "priority" deve ser uma de: ${JSON.stringify(priorities)}.
- Reutilize tags existentes quando fizer sentido: ${JSON.stringify(existingTags.slice(0, 20))}.
- Gere entre 2 e 6 subtasks quando aplicável.
- Gere entre 2 e 5 critérios de aceitação.
- Responda APENAS com JSON válido, sem markdown.

Formato JSON obrigatório:
{
  "title": "string",
  "desc": "string (descrição detalhada, pode usar markdown)",
  "tags": ["string"],
  "priority": "string",
  "bucket": "string",
  "subtasks": [{ "title": "string" }],
  "acceptanceCriteria": ["string"]
}`;

  return [
    { role: "system", content: system },
    { role: "user", content: `Tipo do card: ${cardType}\n\nDescrição do usuário:\n${userPrompt}` },
  ];
}

export function parseCardWriterResponse(text: string): CardWriterOutput | null {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    const obj = JSON.parse(cleaned);
    if (!obj || typeof obj !== "object") return null;
    if (typeof obj.title !== "string" || !obj.title.trim()) return null;

    return {
      title: String(obj.title).trim(),
      desc: String(obj.desc || "").trim(),
      tags: Array.isArray(obj.tags) ? obj.tags.filter((t: unknown) => typeof t === "string").slice(0, 10) : [],
      priority: typeof obj.priority === "string" ? obj.priority : "Média",
      bucket: typeof obj.bucket === "string" ? obj.bucket : "",
      subtasks: Array.isArray(obj.subtasks)
        ? obj.subtasks
            .filter((s: unknown) => s && typeof s === "object" && typeof (s as Record<string, unknown>).title === "string")
            .map((s: Record<string, unknown>) => ({ title: String(s.title).trim() }))
            .slice(0, 10)
        : [],
      acceptanceCriteria: Array.isArray(obj.acceptanceCriteria)
        ? obj.acceptanceCriteria.filter((c: unknown) => typeof c === "string").slice(0, 8)
        : [],
    };
  } catch {
    return null;
  }
}
