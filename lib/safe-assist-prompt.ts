export const SAFE_ASSIST_MODES = [
  "pi_risk_review",
  "wsjf_narrative",
  "dependency_sync",
  "pi_objectives_draft",
] as const;

export type SafeAssistMode = (typeof SAFE_ASSIST_MODES)[number];

const MODE_INSTRUCTIONS: Record<SafeAssistMode, string> = {
  pi_risk_review:
    "Resuma riscos de entrega e dependências no horizonte de PI/iteração. Use Markdown: riscos, impacto, mitigação, dono sugerido. Não invente IDs de equipa; use placeholders se faltarem dados.",
  wsjf_narrative:
    "Explique em linguagem de produto como priorizar itens com WSJF (custo de atraso, tamanho relativo) sem números inventados — proponha critérios e perguntas a fazer ao time. Tabela simples se ajudar.",
  dependency_sync:
    "Proponha um roteiro curto para alinhar dependências entre equipas/ARTs: o que esclarecer, quem convidar, saídas esperadas. Use bullets acionáveis; não afirme integrações técnicas que o quadro não mostra.",
  pi_objectives_draft:
    "Rascunhe 1–3 objetivos de PI alinhados ao product goal (se o contexto existir) e 2–3 resultados mensuráveis por objetivo. Marque o que precisa de validação com stakeholders.",
};

export function buildSafeAssistSystemPrompt(mode: SafeAssistMode): string {
  const spec = MODE_INSTRUCTIONS[mode];
  return [
    "Você apoia liderança e delivery em contexto aproximado a SAFe (SAFe é marca registrada da Scaled Agile, Inc.).",
    "O produto mapeia PI/iteração a sprints; não descreva certificação ou framework completo.",
    "Responda em português do Brasil salvo se o pedido for noutro idioma.",
    "Não invente históricos, métricas de equipa ou resultados reais: use [placeholder] ou perguntas.",
    "",
    `Tarefa (${mode}):`,
    spec,
  ].join("\n");
}

export function buildSafeAssistUserPrompt(context: string, cardSnippet?: string): string {
  const parts: string[] = ["Contexto do PI / quadro:", context.trim() || "(não informado)"];
  if (cardSnippet?.trim()) {
    parts.push("", "Card em foco:", cardSnippet.trim());
  }
  parts.push("", "Gere o artefato pedido.");
  return parts.join("\n");
}
