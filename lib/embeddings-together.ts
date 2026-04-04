/**
 * Embeddings via API compatível com OpenAI (`/v1/embeddings`), ex.: Together.
 * Cards / dependências: `TOGETHER_EMBEDDING_MODEL` ou padrão UAE-Large.
 * Flux Docs RAG: `TOGETHER_DOCS_EMBEDDING_MODEL` ou m2-bert retrieval (dimensões diferentes — não misturar índices).
 */

/** Modelo padrão para embeddings gerais (cards, similaridade, etc.). */
export const DEFAULT_GENERAL_EMBEDDING_MODEL = "WhereIsAI/UAE-Large-V1";

/** Modelo focado em retrieval para indexação e query do RAG de documentos. */
export const DEFAULT_DOCS_EMBEDDING_MODEL = "togethercomputer/m2-bert-80M-8k-retrieval";

export type TextEmbeddingsResult =
  | { ok: true; vectors: number[][] }
  | { ok: false; error: string; status?: number; bodySnippet?: string };

function baseUrl(): string {
  return (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
}

/**
 * POST `/v1/embeddings` (OpenAI-compatible). Devolve motivo em falhas HTTP ou contagem incorreta.
 */
export async function fetchTextEmbeddingsWithMeta(
  inputs: string[],
  opts?: { model?: string }
): Promise<TextEmbeddingsResult> {
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "missing_together_api_key" };
  if (!inputs.length) return { ok: true, vectors: [] };

  const model = (opts?.model ?? process.env.TOGETHER_EMBEDDING_MODEL ?? DEFAULT_GENERAL_EMBEDDING_MODEL).trim();
  const url = `${baseUrl()}/embeddings`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: inputs }),
    });
    const rawText = await res.text().catch(() => "");
    if (!res.ok) {
      const bodySnippet = rawText.slice(0, 500);
      console.warn("[embeddings] HTTP error", res.status, bodySnippet);
      return { ok: false, error: `http_${res.status}`, status: res.status, bodySnippet };
    }
    let data: unknown;
    try {
      data = JSON.parse(rawText) as unknown;
    } catch {
      return { ok: false, error: "invalid_json_response", bodySnippet: rawText.slice(0, 200) };
    }
    const errMsg = (data as { error?: { message?: string; type?: string } })?.error?.message;
    if (typeof errMsg === "string" && errMsg.trim()) {
      console.warn("[embeddings] API error object", errMsg);
      return { ok: false, error: errMsg.trim(), bodySnippet: JSON.stringify((data as { error?: unknown }).error).slice(0, 400) };
    }
    const rows = Array.isArray((data as { data?: unknown }).data)
      ? ((data as { data: Array<{ embedding?: number[]; index?: number }> }).data as Array<{
          embedding?: number[];
          index?: number;
        }>)
      : [];
    const sorted = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const out: number[][] = [];
    for (const row of sorted) {
      const emb = row.embedding;
      if (Array.isArray(emb) && emb.length) out.push(emb);
    }
    if (out.length !== inputs.length) {
      const msg = `embedding_count_mismatch: got ${out.length}, expected ${inputs.length}`;
      console.warn("[embeddings]", msg, { model });
      return { ok: false, error: msg };
    }
    return { ok: true, vectors: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network_error";
    console.warn("[embeddings] error", msg);
    return { ok: false, error: msg };
  }
}

export async function fetchTextEmbeddings(
  inputs: string[],
  opts?: { model?: string }
): Promise<number[][] | null> {
  const r = await fetchTextEmbeddingsWithMeta(inputs, opts);
  return r.ok ? r.vectors : null;
}

/** Embeddings para indexação e pergunta do RAG de Flux Docs (modelo dedicado). */
export async function fetchDocsChunkEmbeddings(inputs: string[]): Promise<number[][] | null> {
  const model = (process.env.TOGETHER_DOCS_EMBEDDING_MODEL || DEFAULT_DOCS_EMBEDDING_MODEL).trim();
  return fetchTextEmbeddings(inputs, { model });
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 1e-12 ? dot / d : 0;
}
