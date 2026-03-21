/**
 * Abstração de provedores LLM (Anthropic Claude vs Together/OpenAI-compat).
 * Embeddings seguem no Together (Anthropic não expõe embeddings no mesmo produto).
 */

import { callTogetherApi, type TogetherChatCompletionsRequest } from "@/lib/llm-utils";
import { fetchTextEmbeddings } from "@/lib/embeddings-together";

export type LlmChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmChatOptions = {
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export type LlmChatSuccess = {
  ok: true;
  assistantText: string;
  provider: "anthropic" | "together";
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
};

export type LlmChatFailure = {
  ok: false;
  error: string;
  status?: number;
  bodySnippet?: string;
  provider?: "anthropic" | "together";
};

export type LlmChatResult = LlmChatSuccess | LlmChatFailure;

export interface LlmProvider {
  readonly name: "anthropic" | "together";
  chat(messages: LlmChatMessage[], tools: unknown | undefined, options?: LlmChatOptions): Promise<LlmChatResult>;
  embed(texts: string[]): Promise<{ ok: true; vectors: number[][] } | { ok: false; error: string }>;
}

function mergeConsecutiveMessages(messages: LlmChatMessage[]): LlmChatMessage[] {
  const out: LlmChatMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role && m.role !== "system") {
      last.content += "\n\n" + m.content;
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function toAnthropicPayload(messages: LlmChatMessage[]): { system?: string; messages: Array<{ role: "user" | "assistant"; content: string }> } {
  let system = "";
  const nonSystem: LlmChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      system += (system ? "\n\n" : "") + m.content;
    } else {
      nonSystem.push(m);
    }
  }
  const merged = mergeConsecutiveMessages(nonSystem).filter((m) => m.role === "user" || m.role === "assistant");
  if (merged.length && merged[0].role === "assistant") {
    merged.unshift({ role: "user", content: " " });
  }
  return {
    system: system.trim() || undefined,
    messages: merged.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  };
}

export class TogetherLlmProvider implements LlmProvider {
  readonly name = "together" as const;

  async chat(messages: LlmChatMessage[], _tools: unknown | undefined, options?: LlmChatOptions): Promise<LlmChatResult> {
    const apiKey = process.env.TOGETHER_API_KEY;
    const model = options?.model ?? process.env.TOGETHER_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    const baseUrl = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
    if (!apiKey?.trim()) {
      return { ok: false, error: "no_api_key", provider: "together" };
    }

    const chatBody: TogetherChatCompletionsRequest = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.2,
      ...(options?.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    };

    const r = await callTogetherApi(chatBody, { apiKey, baseUrl });
    if (!r.ok) {
      return {
        ok: false,
        error: r.error || "request_failed",
        status: r.status,
        bodySnippet: r.bodySnippet,
        provider: "together",
      };
    }

    const data = r.data as { usage?: { prompt_tokens?: number; completion_tokens?: number } } | undefined;
    const usage =
      data?.usage && (data.usage.prompt_tokens != null || data.usage.completion_tokens != null)
        ? {
            inputTokens: Number(data.usage.prompt_tokens ?? 0),
            outputTokens: Number(data.usage.completion_tokens ?? 0),
          }
        : undefined;

    return {
      ok: true,
      assistantText: r.assistantText || "",
      provider: "together",
      model,
      usage,
    };
  }

  async embed(texts: string[]): Promise<{ ok: true; vectors: number[][] } | { ok: false; error: string }> {
    const v = await fetchTextEmbeddings(texts);
    if (!v || v.length !== texts.length) return { ok: false, error: "embed_failed" };
    return { ok: true, vectors: v };
  }
}

export class AnthropicLlmProvider implements LlmProvider {
  readonly name = "anthropic" as const;

  async chat(messages: LlmChatMessage[], _tools: unknown | undefined, options?: LlmChatOptions): Promise<LlmChatResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    const model =
      options?.model ??
      process.env.ANTHROPIC_MODEL ??
      "claude-3-5-sonnet-20241022";
    if (!apiKey) {
      return { ok: false, error: "no_api_key", provider: "anthropic" };
    }

    const { system, messages: amsg } = toAnthropicPayload(messages);
    const maxTokens = Math.min(Math.max(options?.maxTokens ?? 4096, 256), 8192);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: options?.temperature ?? 0.2,
          ...(system ? { system } : {}),
          messages: amsg,
        }),
      });

      const status = res.status;
      if (!res.ok) {
        const bodySnippet = (await res.text().catch(() => "")).slice(0, 400);
        return { ok: false, error: `http_${status}`, status, bodySnippet, provider: "anthropic" };
      }

      const data = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      let text = "";
      const blocks = Array.isArray(data.content) ? data.content : [];
      for (const b of blocks) {
        if (b?.type === "text" && typeof b.text === "string") text += b.text;
      }

      const usage =
        data.usage && (data.usage.input_tokens != null || data.usage.output_tokens != null)
          ? {
              inputTokens: Number(data.usage.input_tokens ?? 0),
              outputTokens: Number(data.usage.output_tokens ?? 0),
            }
          : undefined;

      return { ok: true, assistantText: text, provider: "anthropic", model, usage };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "network_error",
        provider: "anthropic",
      };
    }
  }

  async embed(texts: string[]): Promise<{ ok: true; vectors: number[][] } | { ok: false; error: string }> {
    return new TogetherLlmProvider().embed(texts);
  }
}

export function createTogetherProvider(): LlmProvider {
  return new TogetherLlmProvider();
}

export function createAnthropicProvider(): LlmProvider {
  return new AnthropicLlmProvider();
}
