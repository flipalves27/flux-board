export const LSS_ASSIST_MODES = [
  "project_charter",
  "sipoc",
  "voc_ctq",
  "measurement_plan",
  "root_cause",
  "improvement_ideas",
  "control_plan",
] as const;

export type LssAssistMode = (typeof LSS_ASSIST_MODES)[number];

const MODE_INSTRUCTIONS: Record<LssAssistMode, string> = {
  project_charter:
    "Produza um rascunho de carta de projeto Lean Six Sigma: problema (negócio), escopo, objetivo mensurável, stakeholders, macro-cronograma e riscos iniciais. Use markdown com seções claras.",
  sipoc:
    "Monte um SIPOC: Fornecedores, Entradas, Processo (alto nível), Saídas, Clientes. Tabela ou listas em markdown. Deixe lacunas explícitas quando faltar dado.",
  voc_ctq:
    "Extraia VOC (voz do cliente) e traduza em CTQs (requisitos críticos à qualidade) mensuráveis. Formato: bullets com 'Cliente diz…' → 'CTQ: …'.",
  measurement_plan:
    "Defina plano de medição: métrica Y (definição operacional), fonte de dados, frequência, responsável e critério de baseline. Markdown estruturado.",
  root_cause:
    "Sugira análise de causa raiz: possíveis categorias (6M), hipóteses, próximos passos de validação com dados. Pode incluir esqueleto de Ishikawa em texto.",
  improvement_ideas:
    "Liste contramedidas e ideias de melhoria priorizadas (impacto vs esforço), com piloto sugerido e critérios de sucesso.",
  control_plan:
    "Elabore plano de controle: o que monitorar, frequência, responsável, reações a desvios e padronização (SOP/checklist). Markdown.",
};

export function buildLssAssistSystemPrompt(mode: LssAssistMode): string {
  const spec = MODE_INSTRUCTIONS[mode];
  return [
    "Você é um facilitador sênior Lean Six Sigma. Responda em português do Brasil salvo se o usuário pedir outro idioma.",
    "Use linguagem DMAIC quando fizer sentido. Não prescreva cerimônias Scrum (sprints, daily scrum) como obrigatórias.",
    "Seja prático e evite jargão vazio. Não invente números: use placeholders como [baseline] ou [meta] quando não houver dado.",
    "",
    `Tarefa (${mode}):`,
    spec,
  ].join("\n");
}

export function buildLssAssistUserPrompt(context: string, cardSnippet?: string): string {
  const parts = ["Contexto do projeto / quadro:", context.trim() || "(não informado)"];
  if (cardSnippet?.trim()) {
    parts.push("", "Card em foco:", cardSnippet.trim());
  }
  parts.push("", "Gere o artefato solicitado.");
  return parts.join("\n");
}
