import type { BoardData } from "./kv-boards";
import type { SimilarCardRef } from "./smart-card-enrich";
import { callTogetherApi, safeJsonParse } from "./llm-utils";

export type AiCardClassification = {
  bucketKey?: string;
  priority?: string;
  tags?: string[];
  title?: string;
};

export type IntakeFormLlmClassification = {
  bucketKey?: string;
  priority?: string;
  tags?: string[];
  rationale?: string;
  isLikelyDuplicate?: boolean;
  duplicateCardId?: string | null;
  mergeSuggestion?: string;
};

export async function classifyIntakeFormWithTogether(params: {
  board: BoardData;
  title: string;
  description: string;
  knownTags: string[];
  similarCards: Array<{ id: string; title: string; desc: string; bucket: string }>;
}): Promise<{ ok: boolean; data?: IntakeFormLlmClassification; error?: string }> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
  const base = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  if (!apiKey) {
    return { ok: false, error: "no_api_key" };
  }

  const bucketOrder = Array.isArray(params.board.config?.bucketOrder) ? params.board.config!.bucketOrder : [];
  const columns = bucketOrder
    .map((b) => {
      const rec = b as { key?: string; label?: string };
      return { key: String(rec.key || "").trim(), label: String(rec.label || rec.key || "").trim() };
    })
    .filter((c) => c.key)
    .slice(0, 40);

  const columnKeysJson = JSON.stringify(columns.map((c) => c.key));
  const columnLabelsBlock = columns
    .map((c) => `- key="${c.key}"${c.label && c.label !== c.key ? ` (${c.label})` : ""}`)
    .join("\n");

  const tagsJson = JSON.stringify(params.knownTags.slice(0, 100));
  const similarBlock =
    params.similarCards.length > 0
      ? params.similarCards
          .map(
            (c, i) =>
              `${i + 1}. id=${c.id} | coluna=${c.bucket} | título=${c.title.slice(0, 120)} | trecho=${c.desc
                .replace(/\s+/g, " ")
                .slice(0, 280)}`
          )
          .join("\n")
      : "(nenhum card no quadro para comparar)";

  const system = `Você classifica submissões de formulário público para um quadro Kanban.
Responda APENAS com um objeto JSON válido (sem markdown, sem texto fora do JSON).

Regras:
- "column" deve ser exatamente uma das chaves (key) listadas em colunas permitidas: ${columnKeysJson}
- "priority" deve ser uma de: "Urgente", "Importante", "Média"
- "tags": escolha de 0 a 8 tags APENAS dentre a lista fornecida em tags_conhecidas (use strings exatamente iguais aos itens permitidos quando possível).
- "rationale": explicação curta em português (2–4 frases) do porquê da classificação; será exibida na descrição do card.
- "duplicate": analise se a submissão descreve o MESMO problema que algum dos cards similares listados (mesmo incidente, mesmo pedido, mesmo bloqueio).
  - duplicate.isLikelyDuplicate: true somente se houver forte sobreposição com um card existente cujo id conste na lista de similares.
  - duplicate.duplicateCardId: o id exato do card (campo id=...) ou null.
  - duplicate.mergeSuggestion: se isLikelyDuplicate for true, texto curto sugerindo unificar/atualizar o card existente em vez de duplicar; se false, string vazia.

Formato exato:
{"column":"...","priority":"...","tags":[],"rationale":"...","duplicate":{"isLikelyDuplicate":false,"duplicateCardId":null,"mergeSuggestion":""}}`;

  const user = [
    `Board: ${String(params.board.name || "Quadro").slice(0, 200)}`,
    "",
    "Colunas permitidas:",
    columnLabelsBlock || "(nenhuma — use a primeira key disponível se existir)",
    "",
    `tags_conhecidas (use só estas): ${tagsJson}`,
    "",
    "Últimos cards considerados semanticamente próximos (use para duplicidade e contexto):",
    similarBlock,
    "",
    "Submissão — título:",
    params.title.slice(0, 500),
    "",
    "Submissão — descrição:",
    params.description.slice(0, 8000),
  ].join("\n");

  try {
    const r = await callTogetherApi(
      {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 900,
      },
      { apiKey, baseUrl: base }
    );
    if (!r.ok) return { ok: false, error: r.status != null ? `http_${r.status}` : r.error };
    const raw = r.assistantText;
    const parsed = safeJsonParse<Record<string, unknown>>(raw);
    if (!parsed || typeof parsed !== "object") return { ok: false, error: "parse_error" };

    const colRaw = parsed.column ?? parsed.bucketKey;
    const bucketKey = typeof colRaw === "string" ? colRaw.trim() : undefined;

    const dupRaw = parsed.duplicate;
    let isLikelyDuplicate: boolean | undefined;
    let duplicateCardId: string | null | undefined;
    let mergeSuggestion: string | undefined;
    if (dupRaw && typeof dupRaw === "object") {
      const dr = dupRaw as Record<string, unknown>;
      isLikelyDuplicate = Boolean(dr.isLikelyDuplicate);
      duplicateCardId =
        dr.duplicateCardId === null || dr.duplicateCardId === undefined
          ? null
          : typeof dr.duplicateCardId === "string"
            ? dr.duplicateCardId.trim()
            : null;
      mergeSuggestion = typeof dr.mergeSuggestion === "string" ? dr.mergeSuggestion.trim() : "";
    }

    const data: IntakeFormLlmClassification = {
      bucketKey,
      priority: typeof parsed.priority === "string" ? parsed.priority.trim() : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t)).filter(Boolean).slice(0, 12) : undefined,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.trim() : undefined,
      isLikelyDuplicate,
      duplicateCardId: duplicateCardId === "" ? null : duplicateCardId,
      mergeSuggestion,
    };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export type SmartCardEnrichLlmPayload = {
  description: string;
  priority: string;
  priorityRationale: string;
  tags: string[];
  bucketKey: string;
  direction: string | null;
};

export async function enrichSmartCardWithTogether(params: {
  board: BoardData;
  title: string;
  knownTags: string[];
  similarCards: SimilarCardRef[];
  recentCardLines: string[];
  ragExcerpts: string[];
  leadStats: { avgDays: number; sampleCount: number };
  allowedDirections: string[];
}): Promise<{ ok: boolean; data?: SmartCardEnrichLlmPayload; error?: string }> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
  const base = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  if (!apiKey) {
    return { ok: false, error: "no_api_key" };
  }

  const bucketOrder = Array.isArray(params.board.config?.bucketOrder) ? params.board.config!.bucketOrder : [];
  const columns = bucketOrder
    .map((b) => {
      const rec = b as { key?: string; label?: string };
      return { key: String(rec.key || "").trim(), label: String(rec.label || rec.key || "").trim() };
    })
    .filter((c) => c.key)
    .slice(0, 40);

  const columnKeysJson = JSON.stringify(columns.map((c) => c.key));
  const columnLabelsBlock = columns
    .map((c) => `- key="${c.key}"${c.label && c.label !== c.key ? ` (${c.label})` : ""}`)
    .join("\n");

  const tagsJson = JSON.stringify(params.knownTags.slice(0, 100));
  const directionsJson = JSON.stringify(params.allowedDirections.slice(0, 20));

  const similarBlock =
    params.similarCards.length > 0
      ? params.similarCards
          .map(
            (c, i) =>
              `${i + 1}. id=${c.id} | coluna=${c.bucket} | progresso=${c.progress} | título=${c.title.slice(0, 120)} | trecho=${c.desc
                .replace(/\s+/g, " ")
                .slice(0, 240)}`
          )
          .join("\n")
      : "(nenhum card similar encontrado)";

  const recentBlock =
    params.recentCardLines.length > 0
      ? params.recentCardLines.map((l, i) => `${i + 1}. ${l}`).join("\n")
      : "(sem cards recentes)";

  const ragBlock =
    params.ragExcerpts.length > 0
      ? params.ragExcerpts.map((x, i) => `${i + 1}. ${x}`).join("\n\n")
      : "(nenhum trecho de documentação relevante)";

  const leadHint =
    params.leadStats.sampleCount > 0
      ? `Cards similares concluídos: amostra=${params.leadStats.sampleCount}, lead time médio≈${params.leadStats.avgDays.toFixed(1)} dias (aproximação). A data alvo será calculada no servidor; foque no texto.`
      : "Sem amostra de cards similares concluídos para lead time.";

  const system = `Você preenche automaticamente um novo card Kanban a partir só do título.
Responda APENAS com JSON válido (sem markdown, sem texto fora do JSON).

Regras:
- "bucketKey": exatamente uma das chaves em colunas permitidas: ${columnKeysJson}
- "priority": uma de "Urgente", "Importante", "Média"
- "tags": 0 a 5 strings, APENAS da lista tags_conhecidas (iguais por caractere). Se nenhuma servir, use [].
- "description": 2 a 3 frases em português, claras, para a descrição do card (contexto + próximo passo). Sem títulos de seção.
- "priorityRationale": 1 a 2 frases em português explicando a prioridade.
- "direction": string exatamente uma de ${directionsJson}, ou null se não aplicável.

Formato:
{"bucketKey":"...","priority":"...","priorityRationale":"...","tags":[],"description":"...","direction":null}`;

  const user = [
    `Board: ${String(params.board.name || "Quadro").slice(0, 200)}`,
    "",
    "Colunas permitidas:",
    columnLabelsBlock || "(nenhuma)",
    "",
    `tags_conhecidas: ${tagsJson}`,
    "",
    "Cards similares (referência):",
    similarBlock,
    "",
    "Cards recentes (tom e escopo do board):",
    recentBlock,
    "",
    "Trechos de documentação interna (RAG):",
    ragBlock,
    "",
    leadHint,
    "",
    "Título do novo card:",
    params.title.slice(0, 500),
  ].join("\n");

  try {
    const r = await callTogetherApi(
      {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.25,
        max_tokens: 700,
      },
      { apiKey, baseUrl: base }
    );
    if (!r.ok) return { ok: false, error: r.status != null ? `http_${r.status}` : r.error };
    const raw = r.assistantText;
    const parsed = safeJsonParse<Record<string, unknown>>(raw);
    if (!parsed || typeof parsed !== "object") return { ok: false, error: "parse_error" };

    const bucketKey = typeof parsed.bucketKey === "string" ? parsed.bucketKey.trim() : "";
    const priority = typeof parsed.priority === "string" ? parsed.priority.trim() : "";
    const priorityRationale =
      typeof parsed.priorityRationale === "string" ? parsed.priorityRationale.trim() : "";
    const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
    const tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t)).filter(Boolean).slice(0, 8) : [];
    let direction: string | null = null;
    if (parsed.direction === null || parsed.direction === undefined) {
      direction = null;
    } else if (typeof parsed.direction === "string") {
      const d = parsed.direction.trim();
      direction = d || null;
    }

    const data: SmartCardEnrichLlmPayload = {
      bucketKey,
      priority,
      priorityRationale,
      tags,
      description: description.slice(0, 4000),
      direction,
    };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function classifyCardWithTogether(params: {
  board: BoardData;
  title: string;
  description: string;
}): Promise<{ ok: boolean; data?: AiCardClassification; error?: string }> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
  const base = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  if (!apiKey) {
    return { ok: false, error: "no_api_key" };
  }

  const bucketOrder = Array.isArray(params.board.config?.bucketOrder) ? params.board.config!.bucketOrder : [];
  const bucketKeys = bucketOrder
    .map((b) => String((b as { key?: string })?.key || "").trim())
    .filter(Boolean)
    .slice(0, 40);

  const system = `Você classifica cards de um quadro Kanban. Responda APENAS JSON válido, sem markdown.
Chaves permitidas em "bucketKey" (use exatamente uma): ${JSON.stringify(bucketKeys)}
Prioridades permitidas: ["Urgente","Importante","Média"]
Formato: {"bucketKey":"...","priority":"...","tags":["..."],"title":"opcional curto"}`;

  const user = `Título: ${params.title.slice(0, 500)}\nDescrição: ${params.description.slice(0, 4000)}`;

  try {
    const r = await callTogetherApi(
      {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 500,
      },
      { apiKey, baseUrl: base }
    );
    if (!r.ok) return { ok: false, error: r.status != null ? `http_${r.status}` : r.error };
    const raw = r.assistantText;
    const parsed = safeJsonParse<Record<string, unknown>>(raw);
    if (!parsed || typeof parsed !== "object") return { ok: false, error: "parse_error" };
    const data: AiCardClassification = {
      bucketKey: typeof parsed.bucketKey === "string" ? parsed.bucketKey : undefined,
      priority: typeof parsed.priority === "string" ? parsed.priority : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t)).filter(Boolean).slice(0, 12) : undefined,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
    };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function generateExecutiveBriefTogether(params: {
  boardName: string;
  cardsSummary: string;
}): Promise<{ ok: boolean; text?: string; error?: string }> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
  const base = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  if (!apiKey) return { ok: false, error: "no_api_key" };

  const system =
    "Você é um analista executivo. Gere um briefing curto (máx. 12 linhas) em português, objetivo, com riscos e próximos passos, em texto puro.";

  try {
    const r = await callTogetherApi(
      {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Board: ${params.boardName}\n\nDados:\n${params.cardsSummary.slice(0, 12000)}` },
        ],
        temperature: 0.35,
        max_tokens: 900,
      },
      { apiKey, baseUrl: base }
    );
    if (!r.ok) return { ok: false, error: r.status != null ? `http_${r.status}` : r.error };
    const text = r.assistantText.trim();
    return text ? { ok: true, text } : { ok: false, error: "empty" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}
