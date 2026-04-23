/**
 * Motor LLM via API compatível com OpenAI (`/v1/chat/completions`), ex.: Together, Groq, Azure OpenAI.
 */

import { callTogetherApi, type TogetherChatCompletionsRequest } from "@/lib/llm-utils";
import { fetchTextEmbeddings } from "@/lib/embeddings-together";
import type { OrgOpenAiCompatRuntime } from "@/lib/org-llm-runtime";

export type LlmChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmChatOptions = {
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export type LlmChatSuccess = {
  ok: true;
  assistantText: string;
  provider: "openai_compat";
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
};

export type LlmChatFailure = {
  ok: false;
  error: string;
  status?: number;
  bodySnippet?: string;
  provider?: "openai_compat";
};

export type LlmChatResult = LlmChatSuccess | LlmChatFailure;

export interface LlmProvider {
  readonly name: "openai_compat";
  chat(messages: LlmChatMessage[], tools: unknown | undefined, options?: LlmChatOptions): Promise<LlmChatResult>;
  embed(texts: string[]): Promise<{ ok: true; vectors: number[][] } | { ok: false; error: string }>;
}

export class OpenAiCompatLlmProvider implements LlmProvider {
  readonly name = "openai_compat" as const;

  constructor(private readonly runtime: OrgOpenAiCompatRuntime) {}

  async chat(messages: LlmChatMessage[], _tools: unknown | undefined, options?: LlmChatOptions): Promise<LlmChatResult> {
    const apiKey = this.runtime.apiKey;
    const model = options?.model ?? this.runtime.model;
    const baseUrl = this.runtime.baseUrl.replace(/\/+$/, "");
    if (!apiKey?.trim()) {
      return { ok: false, error: "no_api_key", provider: "openai_compat" };
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
        provider: "openai_compat",
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
      provider: "openai_compat",
      model,
      usage,
    };
  }

  async embed(texts: string[]): Promise<{ ok: true; vectors: number[][] } | { ok: false; error: string }> {
    const v = await fetchTextEmbeddings(texts, {
      apiKey: this.runtime.apiKey,
      baseUrl: this.runtime.baseUrl,
    });
    if (!v || v.length !== texts.length) return { ok: false, error: "embed_failed" };
    return { ok: true, vectors: v };
  }
}

export function createOpenAiCompatProvider(runtime: OrgOpenAiCompatRuntime): LlmProvider {
  return new OpenAiCompatLlmProvider(runtime);
}
