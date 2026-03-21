/**
 * Embeddings via API compatível com OpenAI (`/v1/embeddings`), ex.: Together.
 * Modelo padrão pode ser sobrescrito por TOGETHER_EMBEDDING_MODEL.
 */

const DEFAULT_MODEL = "WhereIsAI/UAE-Large-V1";

function baseUrl(): string {
  return (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
}

export async function fetchTextEmbeddings(inputs: string[]): Promise<number[][] | null> {
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey || !inputs.length) return null;

  const model = (process.env.TOGETHER_EMBEDDING_MODEL || DEFAULT_MODEL).trim();
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
      const snippet = (await res.text().catch(() => "")).slice(0, 200);
      console.warn("[embeddings]", res.status, snippet);
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
