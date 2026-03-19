import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";

type CardContextInput = {
  title?: string;
  description?: string;
};

type CardContextResult = {
  titulo: string;
  descricao: string;
  resumoNegocio: string;
  objetivo: string;
};

type LlmCardContextResult = CardContextResult & {
  generatedWithAI: boolean;
  model?: string;
  provider?: string;
  rawContent?: string;
  errorKind?: "no_api_key" | "no_model" | "http_error" | "network_error" | "parse_error";
  errorMessage?: string;
};

function extractTextFromLlmContent(
  content: string | Array<{ type?: string; text?: string }> | undefined
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      return String(part.text || "").trim();
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function limitToWords(text: string, maxWords: number): string {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.slice(0, maxWords).join(" ").trim();
}

function extractFirstSentence(text: string): string {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const match = normalized.match(/^(.+?[.!?])(\s|$)/);
  return (match?.[1] || normalized).trim();
}

function safeCardContext(raw: unknown): CardContextResult {
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

function heuristicCardContext(title: string, description: string): CardContextResult {
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

function parseJsonFromLlmContent(raw: string): { parsed: unknown; recovered: boolean } {
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

  // Última linha de defesa: tenta remover tudo que não pareça JSON.
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

async function llmCardContext(args: { boardName: string; title: string; description: string }): Promise<LlmCardContextResult> {
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
    "Você é um PM técnico sênior.",
    "Recebe um título e uma descrição de card de um board.",
    "Retorne JSON puro com as chaves: titulo, descricao, resumoNegocio, objetivo.",
    "Regras e formato:",
    "- titulo: máximo de 9 palavras, curto e direto, orientado a negócio.",
    "- resumoNegocio: resumo executivo (máximo 6 linhas) para stakeholders.",
    "- objetivo: 1-3 frases claras sobre o que se pretende alcançar.",
    "- descricao: texto técnico e de negócio para virar a descrição do card. Deve conter, nesta ordem:",
    "  1) Contexto/Negócio",
    "  2) Objetivo",
    "  3) Escopo (o que será feito)",
    "  4) Requisitos técnicos e funcionais (bullets)",
    "  5) Critérios de pronto (bullets de aceitação/verificação)",
    "  6) Premissas/Dependências/Riscos (bullets)",
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
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const message = `HTTP ${response.status} ${response.statusText}${
        errorBody ? ` - ${errorBody.slice(0, 400)}` : ""
      }`;
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

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };
    const content = extractTextFromLlmContent(data.choices?.[0]?.message?.content) || "{}";
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
      errorKind: hasTitulo && hasDescricao ? (parsed.recovered ? undefined : "parse_error") : "parse_error",
      errorMessage:
        hasTitulo && hasDescricao
          ? parsed.recovered
            ? undefined
            : "Falha ao recuperar JSON da IA."
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as CardContextInput;
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();

    if (!title || !description) {
      return NextResponse.json({ error: "Título e descrição são obrigatórios." }, { status: 400 });
    }

    const board = await getBoard(boardId);
    const boardName = board?.name || "Board";

    const result = await llmCardContext({ boardName, title, description });

    return NextResponse.json({
      ok: true,
      titulo: result.titulo,
      descricao: result.descricao,
      resumoNegocio: result.resumoNegocio,
      objetivo: result.objetivo,
      generatedWithAI: result.generatedWithAI,
      provider: result.provider,
      model: result.model,
      llmDebug: {
        generatedWithAI: result.generatedWithAI,
        provider: result.provider,
        model: result.model,
        errorKind: result.errorKind,
        errorMessage: result.errorMessage,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

