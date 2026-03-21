/**
 * Shared helpers for Together / OpenAI-style chat completion responses.
 */

export type TogetherChatMessage = { role: string; content: string };

export type TogetherChatCompletionsRequest = {
  model: string;
  messages: TogetherChatMessage[];
  temperature?: number;
  max_tokens?: number;
} & Record<string, unknown>;

export type TogetherCallSuccess = {
  ok: true;
  status: number;
  /** Raw JSON body from the API. */
  data: unknown;
  /** Normalized assistant message text (string or content-block array). */
  assistantText: string;
};

export type TogetherCallFailure = {
  ok: false;
  error: string;
  status?: number;
  bodySnippet?: string;
};

function blockFragment(part: unknown): string {
  if (part == null) return "";
  if (typeof part === "string") return part;
  if (typeof part !== "object") return String(part);
  const o = part as { text?: unknown; content?: unknown };
  if (typeof o.text === "string") return o.text;
  if (typeof o.content === "string") return o.content;
  if (Array.isArray(o.content)) {
    return o.content.map(blockFragment).join("");
  }
  return "";
}

/**
 * Normalizes `choices[0].message.content` from chat completions (string or content parts).
 * For unknown shapes, falls back to `String(content)` (except null/undefined → "").
 */
export function extractTextFromLlmContent(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(blockFragment).join("").trim();
  }
  return String(content);
}

/**
 * Lenient JSON parse for LLM output: strips ``` fences, slices first `{`…`}` span, then JSON.parse.
 */
export function safeJsonParse<T = unknown>(raw: string): T | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const unfenced = s.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  const candidate = first >= 0 && last > first ? unfenced.slice(first, last + 1) : unfenced;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

/**
 * POST `/v1/chat/completions` to Together (or compatible base URL).
 */
export async function callTogetherApi(
  chatBody: TogetherChatCompletionsRequest,
  opts?: { apiKey?: string; baseUrl?: string }
): Promise<TogetherCallSuccess | TogetherCallFailure> {
  const apiKey = opts?.apiKey ?? process.env.TOGETHER_API_KEY;
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return { ok: false, error: "no_api_key" };
  }
  const baseRaw = opts?.baseUrl ?? process.env.TOGETHER_BASE_URL ?? "https://api.together.xyz/v1";
  const base = String(baseRaw).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chatBody),
    });
    const status = res.status;
    if (!res.ok) {
      const bodySnippet = (await res.text().catch(() => "")).slice(0, 400);
      return { ok: false, error: `http_${status}`, status, bodySnippet };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { ok: false, error: "invalid_json_response", status };
    }
    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message
      ?.content;
    const assistantText = extractTextFromLlmContent(content);
    return { ok: true, status, data, assistantText };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network_error" };
  }
}
