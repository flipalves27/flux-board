import "server-only";

export type SpecPlanMethodology = "scrum" | "kanban" | "lss";

export function methodologyRulesBlock(m: SpecPlanMethodology): string {
  if (m === "scrum") {
    return [
      "Metodologia: Scrum.",
      "- Decomponha em histórias de usuário ou itens de backlog com valor entregável.",
      "- Inclua critérios de aceite no campo description quando fizer sentido.",
      "- Use story points Fibonacci (1,2,3,5,8,13,21) quando estimável; senão null.",
      "- Tags: épicos, sprint, frontend/backend se aplicável.",
    ].join("\n");
  }
  if (m === "kanban") {
    return [
      "Metodologia: Kanban.",
      "- Itens pequenos, rastreáveis, focados em fluxo de valor.",
      "- Atribua serviceClass: expedite | fixed_date | standard | intangible quando aplicável (null se incerto).",
      "- Priorize transparência de fila; evite épicos grandes — divida.",
    ].join("\n");
  }
  return [
    "Metodologia: Lean Six Sigma (DMAIC).",
    "- Relacione itens às fases Define, Measure, Analyze, Improve, Control via tags (ex.: dmaic-define).",
    "- Inclua cartões para métricas, hipóteses, análise de causa e controles quando a especificação permitir.",
    "- Mantenha linguagem de melhoria contínua e dados.",
  ].join("\n");
}

export function buildOutlineUserPrompt(docExcerpt: string): string {
  return [
    "Você analisa especificações técnicas. Extraia estrutura e requisitos em JSON válido, sem markdown.",
    "Schema:",
    '{ "sections": [ { "title": string, "summary": string, "subsections": [ { "title": string, "summary": string } ] } ], "keyRequirements": [ { "id": string, "text": string } ] }',
    "Limite: no máximo 35 seções no total (contando subseções como parte do documento) e 60 keyRequirements.",
    "Responda APENAS o JSON.",
    "",
    "Documento:",
    docExcerpt,
  ].join("\n");
}

export function buildWorkItemsUserPrompt(params: { methodology: SpecPlanMethodology; outlineJson: string }): string {
  return [
    "Com base no outline JSON abaixo, produza itens de trabalho alinhados à metodologia indicada.",
    methodologyRulesBlock(params.methodology),
    "",
    "Schema:",
    '{ "methodologySummary": string, "items": [ { "id": string, "title": string, "description": string, "type": string, "suggestedTags": string[] } ] }',
    "Limite: no máximo 55 itens. IDs únicos (ex.: w1, w2).",
    "Responda APENAS o JSON.",
    "",
    "Outline JSON:",
    params.outlineJson,
  ].join("\n");
}

export function buildCardsUserPrompt(params: {
  methodology: SpecPlanMethodology;
  bucketsJson: string;
  workItemsJson: string;
  allowSubtasks: boolean;
}): string {
  const subtaskNote = params.allowSubtasks
    ? '"subtasks": [ { "title": string, "status": "pending" | "in_progress" | "done" | "blocked" } ] (máx. 6 por item, só se agregarem valor; omita ou [] se não fizer sentido)'
    : '"subtasks": [] (sempre array vazio — não use subtarefas)';

  return [
    "Você mapeia cada work item para uma coluna (bucket) do quadro. NÃO inclua title, desc nem progress no JSON — o servidor copia título e descrição do JSON de work items; progress fica sempre «Não iniciado».",
    "Cada entrada usa workItemId de um item existente no JSON de work items.",
    "bucketKey deve ser EXATAMENTE igual a uma das keys em buckets (case-sensitive).",
    "priority: uma de Urgente, Importante, Média.",
    "Textos curtos para caber no JSON: bucketRationale ≤ 200 caracteres (1 frase curta); rationale ≤ 400 caracteres (2–3 frases no máximo).",
    methodologyRulesBlock(params.methodology),
    "",
    "Schema:",
    `{
  "cardRows": [
    {
      "workItemId": string,
      "bucketKey": string,
      "bucketRationale": string,
      "priority": "Urgente" | "Importante" | "Média",
      "tags": string[],
      "storyPoints": number | null,
      "serviceClass": "expedite" | "fixed_date" | "standard" | "intangible" | null,
      "rationale": string,
      "blockedByTitles": string[],
      ${subtaskNote}
    }
  ]
}`,
    "Limite: no máximo 45 entradas em cardRows. Um por work item quando fizer sentido (pode omitir redundantes).",
    "O JSON tem de ser completo e válido (JSON.parse); não corte a resposta a meio. Se faltar espaço, encurte bucketRationale e rationale primeiro.",
    "Responda APENAS o JSON.",
    "",
    "Colunas (buckets):",
    params.bucketsJson,
    "",
    "Work items:",
    params.workItemsJson,
  ].join("\n");
}

export function buildRemapUserPrompt(params: {
  methodology: SpecPlanMethodology;
  bucketsJson: string;
  workItemsJson: string;
  allowSubtasks: boolean;
}): string {
  return [
    "Remapeie os work items para as colunas corretas do quadro. Título e descrição do card vêm do JSON de work items no servidor — não os repita; ajuste bucketKey, tags, storyPoints, serviceClass, rationale e subtarefas conforme as novas colunas.",
    "",
    buildCardsUserPrompt(params),
  ].join("\n");
}
