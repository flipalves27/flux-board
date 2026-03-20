import type { BoardData } from "./kv-boards";

function extractTextFromLlmContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (p && typeof p === "object") {
          const text = (p as { text?: string }).text;
          if (typeof text === "string") return text;
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function safeJsonParse(raw: string): unknown | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const unfenced = s.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  const candidate = first >= 0 && last > first ? unfenced.slice(first, last + 1) : unfenced;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export type AiCardClassification = {
  bucketKey?: string;
  priority?: string;
  tags?: string[];
  title?: string;
};

export async function classifyCardWithTogether(params: {
  board: BoardData;
  title: string;
  description: string;
}): Promise<{ ok: boolean; data?: AiCardClassification; error?: string }> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
  const base = process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1";
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
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });
    if (!r.ok) return { ok: false, error: `http_${r.status}` };
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const raw = extractTextFromLlmContent(j?.choices?.[0]?.message?.content);
    const parsed = safeJsonParse(raw) as Record<string, unknown> | null;
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
  const base = process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1";
  if (!apiKey) return { ok: false, error: "no_api_key" };

  const system =
    "Você é um analista executivo. Gere um briefing curto (máx. 12 linhas) em português, objetivo, com riscos e próximos passos, em texto puro.";

  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Board: ${params.boardName}\n\nDados:\n${params.cardsSummary.slice(0, 12000)}` },
        ],
        temperature: 0.35,
        max_tokens: 900,
      }),
    });
    if (!r.ok) return { ok: false, error: `http_${r.status}` };
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const text = extractTextFromLlmContent(j?.choices?.[0]?.message?.content).trim();
    return text ? { ok: true, text } : { ok: false, error: "empty" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}
