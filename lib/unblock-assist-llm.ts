import { callTogetherApi, safeJsonParse } from "@/lib/llm-utils";

export type UnblockAssistResult = {
  steps: string[];
  notifyHint: string;
  usedLlm: boolean;
  model?: string;
};

/**
 * Gera próximos passos para desbloquear um card (PT-BR), em JSON estruturado.
 */
export async function generateUnblockAssistPlan(args: {
  cardTitle: string;
  cardDescription: string;
  blockerSummaries: string[];
}): Promise<UnblockAssistResult | { error: string }> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL;
  if (!apiKey || !model) {
    return {
      steps: [
        "Confirme o que cada card bloqueador precisa entregar antes de seguir.",
        "Alinhe com os responsáveis pelos bloqueadores e registre a data combinada.",
        "Atualize as dependências no card se o cenário mudar.",
      ],
      notifyHint: "Notifique os donos dos cards bloqueadores no canal do time ou daily.",
      usedLlm: false,
    };
  }

  const blockers = args.blockerSummaries.slice(0, 8).join("\n- ");
  const user = `Card: "${args.cardTitle}"
Descrição resumida: ${args.cardDescription.slice(0, 1200)}

Bloqueadores (títulos):
- ${blockers || "(nenhum título)"}

Responda SOMENTE JSON válido:
{"steps":["ação concreta 1","ação 2","até 5 itens"],"notifyHint":"quem avisar e como (1 frase)"}`;

  const res = await callTogetherApi(
    {
      model,
      temperature: 0.25,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "Você é coach ágil. Respostas curtas e acionáveis em português brasileiro. Sem markdown, só JSON.",
        },
        { role: "user", content: user },
      ],
    },
    { apiKey }
  );

  if (!res.ok) return { error: res.error };

  const parsed = safeJsonParse<{ steps?: unknown; notifyHint?: unknown }>(res.assistantText);
  const steps = Array.isArray(parsed?.steps)
    ? parsed!.steps!.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
    : [];
  const notifyHint = typeof parsed?.notifyHint === "string" ? parsed.notifyHint.trim() : "";
  if (!steps.length) {
    return { error: "Resposta da IA sem passos utilizáveis." };
  }
  return {
    steps,
    notifyHint: notifyHint || "Alinhe com o time no próximo sync.",
    usedLlm: true,
    model,
  };
}
