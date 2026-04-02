import { callTogetherApi } from "@/lib/llm-utils";

export const CARD_CONTEXT_LIMITS = {
  titleMaxChars: 180,
  descriptionMaxChars: 6000,
  cacheTtlMs: 5 * 60 * 1000,
  maxEntries: 300,
} as const;

export type CardContextResult = {
  titulo: string;
  descricao: string;
  resumoNegocio: string;
  objetivo: string;
};

export type LlmCardContextResult = CardContextResult & {
  generatedWithAI: boolean;
  model?: string;
  provider?: string;
  rawContent?: string;
  errorKind?: "no_api_key" | "no_model" | "http_error" | "network_error" | "parse_error" | "plan_blocked";
  errorMessage?: string;
};

export function limitToWords(text: string, maxWords: number): string {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.slice(0, maxWords).join(" ").trim();
}

export function extractFirstSentence(text: string): string {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const match = normalized.match(/^(.+?[.!?])(\s|$)/);
  return (match?.[1] || normalized).trim();
}

export function safeCardContext(raw: unknown): CardContextResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tituloRaw = String(obj.titulo || "").trim();
  const descricaoRaw = String(obj.descricao || "").trim();
  const resumoNegocioRaw = String(obj.resumoNegocio || "").trim();
  const objetivoRaw = String(obj.objetivo || "").trim();

  return {
    titulo: limitToWords(tituloRaw || "Novo card", 9),
    resumoNegocio: resumoNegocioRaw.slice(0, 700) || "Resumo de negócio não disponível.",
    objetivo: objetivoRaw.slice(0, 300) || extractFirstSentence(descricaoRaw).slice(0, 300) || "Definir objetivo com base na descrição.",
    descricao: descricaoRaw.slice(0, 6000) || "Descrição não disponível.",
  };
}

export function heuristicCardContext(title: string, description: string): CardContextResult {
  const t = String(title || "").trim();
  const d = String(description || "").trim();

  const firstSentence = extractFirstSentence(d);
  const words = t ? limitToWords(t, 9) : "Novo card";
  const resumo = d.length > 600 ? `${d.slice(0, 600)}...` : d;

  const objective = firstSentence
    ? limitToWords(firstSentence.replace(/^(-\s*)/g, ""), 35)
    : "Definir objetivo e critérios de pronto para o card.";

  const descricao = [
    "Contexto/Negócio:",
    resumo,
    "",
    "Objetivo:",
    objective,
    "",
    "Escopo e especificação (com base no que foi informado):",
    d,
    "",
    "Critérios de pronto (sugestão):",
    "- Requisitos técnicos e funcionais descritos com clareza e alinhados ao objetivo.",
    "- Escopo do que será entregue definido (o que entra e o que não entra).",
    "- Critérios de aceite indicados em linguagem verificável.",
    "- Premissas, dependências e riscos mapeados para execução com o time.",
  ].join("\n");

  return {
    titulo: limitToWords(words, 9),
    descricao: descricao.slice(0, 6000),
    resumoNegocio: resumo.slice(0, 700),
    objetivo: objective.slice(0, 300),
  };
}

/** Fallback when only a raw voice transcript is available (no structured title/description). */
export function heuristicCardContextFromTranscript(transcript: string): CardContextResult {
  const d = String(transcript || "").replace(/\s+/g, " ").trim();
  if (!d) {
    return heuristicCardContext("Novo card", "");
  }
  const title = limitToWords(d, 9) || "Novo card";
  return heuristicCardContext(title, d);
}

function sanitizeJsonCandidate(value: string): string {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractBalancedJsonObject(value: string): string | null {
  const input = String(value || "");
  const start = input.indexOf("{");
  if (start < 0) return null;
  let inString = false;
  let escaped = false;
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return input.slice(start, i + 1).trim();
    }
  }
  return null;
}

export function parseJsonFromLlmContent(raw: string): { parsed: unknown; recovered: boolean } {
  const direct = raw?.trim();
  if (!direct) return { parsed: {}, recovered: false };
  try {
    const candidate = JSON.parse(direct);
    return { parsed: candidate, recovered: false };
  } catch {
    // Continua para estratégias de recuperação.
  }

  const sanitized = sanitizeJsonCandidate(raw);
  try {
    const candidate = JSON.parse(sanitized);
    return { parsed: candidate, recovered: true };
  } catch {
    // Continua para extração por objeto balanceado.
  }

  const balanced = extractBalancedJsonObject(raw);
  if (balanced) {
    try {
      const candidate = JSON.parse(sanitizeJsonCandidate(balanced));
      return { parsed: candidate, recovered: true };
    } catch {
      // Continua para fallback abaixo.
    }
  }

  const maybe = raw.match(/\{[\s\S]*\}/)?.[0];
  if (maybe) {
    try {
      const candidate = JSON.parse(sanitizeJsonCandidate(maybe));
      return { parsed: candidate, recovered: true };
    } catch {
      // ignore
    }
  }

  return { parsed: {}, recovered: true };
}

export async function llmStructuredCardContext(args: {
  boardName: string;
  title: string;
  description: string;
}): Promise<LlmCardContextResult> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    const heuristic = heuristicCardContext(args.title, args.description);
    return {
      ...heuristic,
      generatedWithAI: false,
      provider: "together.ai",
      errorKind: "no_api_key",
      errorMessage: "TOGETHER_API_KEY não configurada. Usando modo heurístico.",
    };
  }

  const baseUrl = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  const model = process.env.TOGETHER_MODEL;
  if (!model) {
    const heuristic = heuristicCardContext(args.title, args.description);
    return {
      ...heuristic,
      generatedWithAI: false,
      provider: "together.ai",
      errorKind: "no_model",
      errorMessage: "TOGETHER_MODEL não configurada. Defina no ambiente. Usando modo heurístico.",
    };
  }

  const prompt = [
    "Você é a Fluxy, assistente de IA do Flux-Board, atuando como PM técnico sênior.",
    "Recebe um título e uma descrição de card de um board.",
    "Retorne JSON puro com as chaves: titulo, descricao, resumoNegocio, objetivo.",
    "Regras e formato:",
    "- titulo: máximo de 9 palavras, curto e direto, orientado a negócio.",
    "- resumoNegocio: resumo executivo (máximo 6 linhas) para stakeholders.",
    "- objetivo: 1-3 frases claras sobre o que se pretende alcançar.",
    "- descricao: texto tecnico e de negocio para virar a descricao do card. Deve conter, nesta ordem e com estes titulos exatos seguidos de dois pontos:",
    "  1) Contexto/Negócio",
    "  2) Objetivo",
    "  3) Escopo",
    "  4) Critérios de Sucesso",
    "  5) Observações",
    "- Em Escopo, detalhe o que entra e o que nao entra na entrega.",
    "- Em Critérios de Sucesso, use bullets verificaveis de aceite/validacao.",
    "- Em Observações, inclua premissas, dependencias e riscos (bullets).",
    "- Linguagem: portuguesa, clara, objetiva e técnica.",
    "- Não inclua nenhum texto fora do JSON.",
    "",
    `Board: ${args.boardName}`,
    "",
    `Título (informado): ${args.title}`,
    `Descrição (informada):`,
    args.description.slice(0, 6000),
  ].join("\n");

  try {
    const response = await callTogetherApi(
      {
        model,
        temperature: 0.25,
        messages: [{ role: "user", content: prompt }],
      },
      { apiKey, baseUrl }
    );

    if (!response.ok) {
      const errorBody = response.bodySnippet || "";
      const message = `HTTP ${response.status ?? "?"}${errorBody ? ` - ${errorBody.slice(0, 400)}` : ""}`;
      const heuristic = heuristicCardContext(args.title, args.description);
      return {
        ...heuristic,
        generatedWithAI: false,
        model,
        provider: "together.ai",
        errorKind: "http_error",
        errorMessage: message,
      };
    }

    const content = response.assistantText || "{}";
    const parsed = parseJsonFromLlmContent(content);

    const heuristic = heuristicCardContext(args.title, args.description);
    const parsedObj = (parsed.parsed && typeof parsed.parsed === "object" ? parsed.parsed : {}) as Record<
      string,
      unknown
    >;
    const hasTitulo = Boolean(String(parsedObj.titulo || "").trim());
    const hasDescricao = Boolean(String(parsedObj.descricao || "").trim());

    const safe = safeCardContext(parsed.parsed);
    const final = hasTitulo && hasDescricao ? safe : heuristic;

    return {
      ...final,
      generatedWithAI: hasTitulo && hasDescricao,
      model,
      provider: "together.ai",
      rawContent: content,
      errorKind: hasTitulo && hasDescricao ? undefined : "parse_error",
      errorMessage:
        hasTitulo && hasDescricao
          ? undefined
          : "Resposta da IA incompleta; usando fallback estruturado.",
    };
  } catch (err) {
    const heuristic = heuristicCardContext(args.title, args.description);
    return {
      ...heuristic,
      generatedWithAI: false,
      provider: "together.ai",
      model,
      errorKind: "network_error",
      errorMessage: err instanceof Error ? err.message : "Erro de rede ao chamar a IA.",
    };
  }
}

export async function llmVoiceTranscriptCardContext(args: { boardName: string; transcript: string }): Promise<LlmCardContextResult> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const transcript = args.transcript.slice(0, 4000);

  if (!apiKey) {
    const heuristic = heuristicCardContextFromTranscript(transcript);
    return {
      ...heuristic,
      generatedWithAI: false,
      provider: "together.ai",
      errorKind: "no_api_key",
      errorMessage: "TOGETHER_API_KEY não configurada. Usando modo heurístico.",
    };
  }

  const baseUrl = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  const model = process.env.TOGETHER_MODEL;
  if (!model) {
    const heuristic = heuristicCardContextFromTranscript(transcript);
    return {
      ...heuristic,
      generatedWithAI: false,
      provider: "together.ai",
      errorKind: "no_model",
      errorMessage: "TOGETHER_MODEL não configurada. Defina no ambiente. Usando modo heurístico.",
    };
  }

  const prompt = [
    "Você é a Fluxy, assistente de IA do Flux-Board, atuando como PM técnico sênior.",
    "Recebe uma TRANSCRIÇÃO de fala espontânea sobre um possível card de trabalho no board (pode conter disfluências, repetições, hesitações ou ruído de reconhecimento de voz).",
    "Infira a intenção principal do usuário, descarte trechos claramente irrelevantes ou erros óbvios de transcrição, e estruture um card profissional.",
    "Retorne JSON puro com as chaves: titulo, descricao, resumoNegocio, objetivo.",
    "Regras e formato (iguais ao modo estruturado):",
    "- titulo: máximo de 9 palavras, curto e direto, orientado a negócio.",
    "- resumoNegocio: resumo executivo (máximo 6 linhas) para stakeholders.",
    "- objetivo: 1-3 frases claras sobre o que se pretende alcançar.",
    "- descricao: texto técnico e de negócio. Deve conter, nesta ordem e com estes títulos exatos seguidos de dois pontos:",
    "  1) Contexto/Negócio",
    "  2) Objetivo",
    "  3) Escopo",
    "  4) Critérios de Sucesso",
    "  5) Observações",
    "- Em Escopo, detalhe o que entra e o que não entra na entrega.",
    "- Em Critérios de Sucesso, use bullets verificáveis de aceite/validação.",
    "- Em Observações, inclua premissas, dependências e riscos (bullets).",
    "- Linguagem: portuguesa, clara, objetiva e técnica.",
    "- Não inclua nenhum texto fora do JSON.",
    "",
    `Board: ${args.boardName}`,
    "",
    "Transcrição (falada):",
    transcript,
  ].join("\n");

  try {
    const response = await callTogetherApi(
      {
        model,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      },
      { apiKey, baseUrl }
    );

    if (!response.ok) {
      const errorBody = response.bodySnippet || "";
      const message = `HTTP ${response.status ?? "?"}${errorBody ? ` - ${errorBody.slice(0, 400)}` : ""}`;
      const heuristic = heuristicCardContextFromTranscript(transcript);
      return {
        ...heuristic,
        generatedWithAI: false,
        model,
        provider: "together.ai",
        errorKind: "http_error",
        errorMessage: message,
      };
    }

    const content = response.assistantText || "{}";
    const parsed = parseJsonFromLlmContent(content);
    const heuristic = heuristicCardContextFromTranscript(transcript);
    const parsedObj = (parsed.parsed && typeof parsed.parsed === "object" ? parsed.parsed : {}) as Record<
      string,
      unknown
    >;
    const hasTitulo = Boolean(String(parsedObj.titulo || "").trim());
    const hasDescricao = Boolean(String(parsedObj.descricao || "").trim());

    const safe = safeCardContext(parsed.parsed);
    const final = hasTitulo && hasDescricao ? safe : heuristic;

    return {
      ...final,
      generatedWithAI: hasTitulo && hasDescricao,
      model,
      provider: "together.ai",
      rawContent: content,
      errorKind: hasTitulo && hasDescricao ? undefined : "parse_error",
      errorMessage:
        hasTitulo && hasDescricao
          ? undefined
          : "Resposta da IA incompleta; usando fallback a partir da transcrição.",
    };
  } catch (err) {
    const heuristic = heuristicCardContextFromTranscript(transcript);
    return {
      ...heuristic,
      generatedWithAI: false,
      provider: "together.ai",
      model,
      errorKind: "network_error",
      errorMessage: err instanceof Error ? err.message : "Erro de rede ao chamar a IA.",
    };
  }
}
