import { callTogetherApi } from "./llm-utils";

export type FluxReportExplainResult = {
  narrative: string;
  generatedWithAI: boolean;
  model?: string;
  provider?: string;
  errorKind?: string;
  errorMessage?: string;
};

function heuristicNarrative(chartTitle: string, dataSummary: string): string {
  return [
    `(${chartTitle}) Com base nos números resumidos abaixo, o cenário pede atenção aos outliers e às colunas com maior concentração de itens.`,
    `Dados: ${dataSummary.slice(0, 500)}${dataSummary.length > 500 ? "…" : ""}`,
  ].join(" ");
}

export async function generateFluxReportExplain(opts: {
  chartId: string;
  chartTitle: string;
  dataSummary: string;
}): Promise<FluxReportExplainResult> {
  const { chartId, chartTitle, dataSummary } = opts;
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL;
  const baseUrl = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");

  if (!apiKey || !model) {
    return {
      narrative: heuristicNarrative(chartTitle, dataSummary),
      generatedWithAI: false,
      provider: "openai_compat",
      errorKind: "missing_config",
      errorMessage: "TOGETHER_API_KEY ou TOGETHER_MODEL não configurados.",
    };
  }

  const prompt = [
    "Você é analista de operações e BI. Escreva uma narrativa executiva CURTA em português (Brasil).",
    "Objetivo: transformar os dados do gráfico em 2 a 4 frases acionáveis para liderança (sem repetir números em lista).",
    "Mencione risco, gargalo ou tendência quando fizer sentido. Tom: direto, profissional.",
    "",
    `Gráfico (id interno): ${chartId}`,
    `Título: ${chartTitle}`,
    "",
    "Dados / métricas (JSON ou texto compacto):",
    dataSummary.slice(0, 12_000),
  ].join("\n");

  try {
    const response = await callTogetherApi(
      {
        model,
        temperature: 0.25,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      },
      { apiKey, baseUrl }
    );

    if (!response.ok) {
      return {
        narrative: heuristicNarrative(chartTitle, dataSummary),
        generatedWithAI: false,
        provider: "openai_compat",
        errorKind: "http_error",
        errorMessage: `HTTP ${response.status ?? "?"} ${response.bodySnippet || response.error}`,
      };
    }

    const raw = response.assistantText || "";
    const narrative = raw.trim().slice(0, 2000);
    if (!narrative) {
      return {
        narrative: heuristicNarrative(chartTitle, dataSummary),
        generatedWithAI: false,
        provider: "openai_compat",
        errorKind: "empty",
        errorMessage: "Resposta vazia da IA.",
      };
    }

    return { narrative, generatedWithAI: true, model, provider: "openai_compat" };
  } catch (err) {
    return {
      narrative: heuristicNarrative(chartTitle, dataSummary),
      generatedWithAI: false,
      provider: "openai_compat",
      errorKind: "network_error",
      errorMessage: err instanceof Error ? err.message : "Erro de rede.",
    };
  }
}

function heuristicLssExecutive(chartTitle: string, dataSummary: string): string {
  return [
    `(${chartTitle}) Visão Lean Six Sigma: revise concentração por fase DMAIC, itens com aging elevado e ritmo de conclusões nas últimas semanas.`,
    `Dados: ${dataSummary.slice(0, 500)}${dataSummary.length > 500 ? "…" : ""}`,
  ].join(" ");
}

/** Narrativa para steering / C-level a partir de métricas do relatório LSS. */
export async function generateLssExecutiveReportExplain(opts: {
  chartId: string;
  chartTitle: string;
  dataSummary: string;
}): Promise<FluxReportExplainResult> {
  const { chartId, chartTitle, dataSummary } = opts;
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL;
  const baseUrl = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");

  if (!apiKey || !model) {
    return {
      narrative: heuristicLssExecutive(chartTitle, dataSummary),
      generatedWithAI: false,
      provider: "openai_compat",
      errorKind: "missing_config",
      errorMessage: "TOGETHER_API_KEY ou TOGETHER_MODEL não configurados.",
    };
  }

  const prompt = [
    "Você é consultor sênior Lean Six Sigma falando para CEO, COO ou comitê de melhorias.",
    "Escreva em português (Brasil) um texto CURTO: 2 a 4 frases, tom executivo, foco em decisão e risco.",
    "Estruture mentalmente em: onde está o gargalo DMAIC, exposição por aging/WIP, e se o ritmo de conclusões sustenta a carteira.",
    "Evite jargão vazio; não liste números um a um — interprete o padrão. Se faltar dado, diga o que validar na próxima reunião.",
    "",
    `Painel (id): ${chartId}`,
    `Título: ${chartTitle}`,
    "",
    "Métricas (JSON ou texto):",
    dataSummary.slice(0, 12_000),
  ].join("\n");

  try {
    const response = await callTogetherApi(
      {
        model,
        temperature: 0.2,
        max_tokens: 450,
        messages: [{ role: "user", content: prompt }],
      },
      { apiKey, baseUrl }
    );

    if (!response.ok) {
      return {
        narrative: heuristicLssExecutive(chartTitle, dataSummary),
        generatedWithAI: false,
        provider: "openai_compat",
        errorKind: "http_error",
        errorMessage: `HTTP ${response.status ?? "?"} ${response.bodySnippet || response.error}`,
      };
    }

    const raw = response.assistantText || "";
    const narrative = raw.trim().slice(0, 2200);
    if (!narrative) {
      return {
        narrative: heuristicLssExecutive(chartTitle, dataSummary),
        generatedWithAI: false,
        provider: "openai_compat",
        errorKind: "empty",
        errorMessage: "Resposta vazia da IA.",
      };
    }

    return { narrative, generatedWithAI: true, model, provider: "openai_compat" };
  } catch (err) {
    return {
      narrative: heuristicLssExecutive(chartTitle, dataSummary),
      generatedWithAI: false,
      provider: "openai_compat",
      errorKind: "network_error",
      errorMessage: err instanceof Error ? err.message : "Erro de rede.",
    };
  }
}
