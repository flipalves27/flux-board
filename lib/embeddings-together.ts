/**
 * Embeddings via API compatível com OpenAI (`/v1/embeddings`), ex.: Together.
 * Cards / dependências: `TOGETHER_EMBEDDING_MODEL` ou padrão UAE-Large.
 * Flux Docs RAG: `TOGETHER_DOCS_EMBEDDING_MODEL` ou m2-bert retrieval (dimensões diferentes — não misturar índices).
 */

const DEFAULT_MODEL = "WhereIsAI/UAE-Large-V1";

/** Modelo focado em retrieval para indexação e query do RAG de documentos. */
export const DEFAULT_DOCS_EMBEDDING_MODEL = "togethercomputer/m2-bert-80M-8k-retrieval";

function baseUrl(): string {
  return (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
}

export async function fetchTextEmbeddings(
  inputs: string[],
  opts?: { model?: string }
): Promise<number[][] | null> {
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey || !inputs.length) return null;

  const model = (opts?.model ?? process.env.TOGETHER_EMBEDDING_MODEL ?? DEFAULT_MODEL).trim();
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
    if (!res.ok) {
      await res.text().catch(() => "");
      console.warn("[embeddings] HTTP error", res.status);
      return null;
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };
    const rows = Array.isArray(data?.data) ? data.data : [];
    const sorted = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const out: number[][] = [];
    for (const row of sorted) {
      const emb = row.embedding;
      if (Array.isArray(emb) && emb.length) out.push(emb);
    }
    return out.length === inputs.length ? out : null;
  } catch (e) {
    console.warn("[embeddings] error", e instanceof Error ? e.message : e);
    return null;
  }
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
