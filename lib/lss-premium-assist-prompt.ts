export const LSS_PREMIUM_ASSIST_MODES = [
  "steering_narrative",
  "fmea_draft",
  "hypothesis_test_exec",
  "control_chart_interpretation",
  "dmaic_audit_readiness",
] as const;

export type LssPremiumAssistMode = (typeof LSS_PREMIUM_ASSIST_MODES)[number];

const MODE_INSTRUCTIONS: Record<LssPremiumAssistMode, string> = {
  steering_narrative:
    "Gere um texto para comitê de governança / steering: situação do projeto DMAIC, decisões pendentes, riscos (dados, adesão, prazo), e 3 perguntas que a liderança deve fazer à equipe. Markdown com seções curtas.",
  fmea_draft:
    "Elabore um esboço de FMEA (modo de falha, efeito, severidade, ocorrência, detecção, RPN relativo, ações sugeridas). Use tabela em markdown; preencha com placeholders quando não houver dado — não invente números.",
  hypothesis_test_exec:
    "Explique em linguagem executiva uma hipótese DMAIC, o que seria medido, desenho do teste (antes/depois ou piloto), critério de sucesso e o que invalidaria a hipótese. Sem fórmulas pesadas; foco em decisão.",
  control_chart_interpretation:
    "O usuário pode colar descrição ou série de pontos. Interprete como analista LSS: sinais de tendência, pontos fora de limites (se mencionados), estabilidade vs. capacidade, próximos passos. Se os dados forem insuficientes, diga exatamente o que coletar.",
  dmaic_audit_readiness:
    "Liste checklist de prontidão para auditoria / fechamento de fase DMAIC: artefatos esperados (charter, VOC/CTQ, plano de medição, análise, solução, controle), lacunas prováveis e evidências a reunir. Markdown com bullets acionáveis.",
};

export function buildLssPremiumAssistSystemPrompt(mode: LssPremiumAssistMode): string {
  const spec = MODE_INSTRUCTIONS[mode];
  return [
    "Você é especialista Lean Six Sigma (Master Black Belt) apoiando líderes C-level.",
    "Responda em português do Brasil salvo se o usuário pedir outro idioma.",
    "Tom: executivo, claro, orientado a risco e decisão. Evite jargão desnecessário; quando usar termo técnico, contextualize em uma frase.",
    "Não invente métricas ou resultados de estudo: use placeholders ([baseline], [amostra], [meta]) quando faltar dado.",
    "Sugira formato de entregável quando útil (ex.: um slide por achado, anexo de riscos).",
    "",
    `Tarefa premium (${mode}):`,
    spec,
  ].join("\n");
}

export function buildLssPremiumAssistUserPrompt(context: string, cardSnippet?: string): string {
  const parts = ["Contexto do projeto / quadro:", context.trim() || "(não informado)"];
  if (cardSnippet?.trim()) {
    parts.push("", "Card em foco:", cardSnippet.trim());
  }
  parts.push("", "Gere o artefato solicitado.");
  return parts.join("\n");
}
