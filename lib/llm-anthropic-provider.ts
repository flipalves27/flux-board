/**
 * Anthropic Messages API — parallel code path to OpenAI-compat (BYOK / server ANTHROPIC_API_KEY).
 */

export type AnthropicMessage = { role: "user" | "assistant"; content: string };

export type AnthropicChatOptions = {
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export type AnthropicChatSuccess = {
  ok: true;
  assistantText: string;
  provider: "anthropic";
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
};

export type AnthropicChatFailure = {
  ok: false;
  error: string;
  status?: number;
  bodySnippet?: string;
};

export type AnthropicChatResult = AnthropicChatSuccess | AnthropicChatFailure;

export async function anthropicMessagesChat(params: {
  apiKey: string;
  model: string;
  system?: string;
  messages: AnthropicMessage[];
  options?: AnthropicChatOptions;
}): Promise<AnthropicChatResult> {
  const key = params.apiKey?.trim();
  if (!key) return { ok: false, error: "no_api_key" };

  const body = {
    model: params.model,
    max_tokens: params.options?.maxTokens ?? 4096,
    temperature: params.options?.temperature ?? 0.2,
    ...(params.system ? { system: params.system } : {}),
    messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const text = await r.text();
  if (!r.ok) {
    return {
      ok: false,
      error: "request_failed",
      status: r.status,
      bodySnippet: text.slice(0, 400),
    };
  }

  let data: {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return { ok: false, error: "invalid_json", status: r.status, bodySnippet: text.slice(0, 200) };
  }

  const assistantText =
    data.content?.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("") ?? "";

  const usage =
    data.usage && (data.usage.input_tokens != null || data.usage.output_tokens != null)
      ? {
          inputTokens: Number(data.usage.input_tokens ?? 0),
          outputTokens: Number(data.usage.output_tokens ?? 0),
        }
      : undefined;

  return {
    ok: true,
    assistantText,
    provider: "anthropic",
    model: params.model,
    usage,
  };
}

export function resolveAnthropicForgeConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || process.env.FLUX_ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const model =
    process.env.FLUX_FORGE_ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514";
  return { apiKey, model };
}
