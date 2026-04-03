import { NextRequest, NextResponse } from "next/server";
import { getClientIpFromHeaders } from "@/lib/client-ip";
import type { LlmChatMessage } from "@/lib/llm-provider";
import { createAnthropicProvider } from "@/lib/llm-provider";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TURNS = 14;
const MAX_CONTENT = 4000;

function buildSystemPrompt(locale: string): string {
  const pt = /^pt/i.test(locale);
  if (pt) {
    return [
      "Você é a Fluxy, assistente do produto Flux-Board — plataforma de quadros Kanban, metas (OKRs), relatórios, formulários e IA integrada (Fluxy, Copilot) para times.",
      "Responda só com informação geral e pública sobre o produto e boas práticas de gestão. Não invente preços, limites exatos de planos ou detalhes legais; oriente a consultar a página de preços e a documentação.",
      "Idioma: português do Brasil. Tom profissional e conciso.",
    ].join("\n");
  }
  return [
    "You are Fluxy, the assistant for Flux-Board — a platform for Kanban boards, OKRs, reporting, forms, and in-flow AI (Fluxy, Copilot) for teams.",
    "Answer only with general, public information about the product and delivery practices. Do not invent exact pricing or plan limits; point users to the pricing page and documentation.",
    "Use clear, professional English.",
  ].join("\n");
}

/** Public landing: whether Claude is wired (no secrets exposed). */
export async function GET() {
  return NextResponse.json({ llmEnabled: Boolean(process.env.ANTHROPIC_API_KEY?.trim()) });
}

type PostBody = {
  locale?: string;
  messages?: Array<{ role?: string; content?: unknown }>;
};

export async function POST(request: NextRequest) {
  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({
    key: `public-fluxy:${ip}`,
    limit: 36,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    const retryAfter = String(rl.retryAfterSeconds);
    return NextResponse.json(
      { error: "rate_limit", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": retryAfter } }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ mode: "fallback" as const, reason: "no_api_key" as const });
  }

  const body = (await request.json().catch(() => ({}))) as PostBody;
  const locale = typeof body.locale === "string" ? body.locale.trim().slice(0, 16) : "en";
  const rawList = Array.isArray(body.messages) ? body.messages : [];
  const messages: LlmChatMessage[] = [];

  for (const m of rawList.slice(-MAX_TURNS)) {
    const role = m.role === "assistant" || m.role === "user" ? m.role : null;
    if (!role) continue;
    const content = sanitizeText(typeof m.content === "string" ? m.content : "")
      .trim()
      .slice(0, MAX_CONTENT);
    if (!content) continue;
    messages.push({ role, content });
  }

  if (!messages.length || messages[messages.length - 1]!.role !== "user") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const lastIx = messages.length - 1;
  const guarded = guardUserPromptForLlm(messages[lastIx]!.content);
  if (!guarded.text.trim()) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  messages[lastIx] = { role: "user", content: guarded.text };

  const provider = createAnthropicProvider();
  const landingModel = process.env.ANTHROPIC_LANDING_MODEL?.trim();
  const payload: LlmChatMessage[] = [{ role: "system", content: buildSystemPrompt(locale) }, ...messages];

  const result = await provider.chat(payload, undefined, {
    temperature: 0.25,
    maxTokens: 1800,
    ...(landingModel ? { model: landingModel } : {}),
  });

  if (!result.ok) {
    return NextResponse.json({ mode: "fallback" as const, reason: "llm_error" as const });
  }

  return NextResponse.json({
    mode: "llm" as const,
    text: result.assistantText.trim(),
  });
}
