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
      provider: "together.ai",
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
        provider: "together.ai",
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
        provider: "together.ai",
        errorKind: "empty",
        errorMessage: "Resposta vazia da IA.",
      };
    }

    return { narrative, generatedWithAI: true, model, provider: "together.ai" };
  } catch (err) {
    return {
      narrative: heuristicNarrative(chartTitle, dataSummary),
      generatedWithAI: false,
      provider: "together.ai",
      errorKind: "network_error",
      errorMessage: err instanceof Error ? err.message : "Erro de rede.",
    };
  }
}
