import { NextRequest, NextResponse } from "next/server";
import Fuse from "fuse.js";
import { getAuthFromRequest } from "@/lib/auth";
import { getAllManualChunksForLocale } from "@/lib/manual-chunks";
import { matchManualFaq } from "@/lib/manual-faq";
import type { ManualChunk, ManualLocale } from "@/lib/manual-types";
import { callTogetherApi, extractTextFromLlmContent } from "@/lib/llm-utils";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Ajuda do **manual** (plataforma): RAG heurístico sobre `content/manual` + resposta do modelo.
 *
 * Chave de API: usa **só a chave da plataforma** (Together / compat), não a chave por org
 * (`org_chat` e gating de produto), para o manual estar disponível a toda a org.
 * Override opcional: `FLUX_MANUAL_ASK_TOGETHER_KEY` (fallback: `TOGETHER_API_KEY`).
 */
function platformManualLlmKey(): string {
  return (
    process.env.FLUX_MANUAL_ASK_TOGETHER_KEY?.trim() ||
    process.env.TOGETHER_API_KEY?.trim() ||
    ""
  );
}

function retrieveChunks(query: string, locale: ManualLocale, k = 8): ManualChunk[] {
  const chunks = getAllManualChunksForLocale(locale);
  if (!query.trim()) return chunks.slice(0, k);
  const fuse = new Fuse(chunks, {
    keys: [
      { name: "text", weight: 0.65 },
      { name: "sectionTitle", weight: 0.2 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });
  const hits = fuse.search(query, { limit: k });
  if (hits.length) return hits.map((h) => h.item);
  return chunks.slice(0, k);
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const rl = await rateLimit({
    key: `manual-ask:${payload.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas perguntas. Tente de novo em instantes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    locale?: string;
    pageId?: string;
    message?: string;
  } | null;
  const locale: ManualLocale = body?.locale === "en" ? "en" : "pt-BR";
  const pageId = typeof body?.pageId === "string" ? body.pageId.slice(0, 120) : undefined;
  const rawMsg = typeof body?.message === "string" ? body.message : "";
  const guarded = guardUserPromptForLlm(rawMsg);
  const message = guarded.text.trim().slice(0, 4_000);
  if (!message) {
    return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
  }

  const faq = matchManualFaq(message, locale, 3);
  if (faq) {
    return NextResponse.json({
      reply: faq.item.a,
      source: "faq" as const,
      citations: [],
    });
  }

  const chunks = retrieveChunks(message, locale, 8);
  const block = chunks
    .map(
      (c) =>
        `[${c.slug} · ${c.sectionTitle}](chunk: ${c.chunkId})\n${c.text}`.trim()
    )
    .join("\n\n---\n\n");

  const sys =
    locale === "en"
      ? `You are Fluxy, the in-app help for Flux-Board. Answer ONLY from the CONTEXT below (product manual). If the answer is not there, say you do not have that in the manual and point to /manual/plans for limits. Cite section titles. Do not use board or org data. Be concise.`
      : `És a Fluxy, ajuda in-app do Flux-Board. Responde APENAS a partir do CONTEXTO (manual de produto). Se não houver, diz que o manual não cobre e aponta para /manual/plans quanto a limites. Cita títulos. Não uses dados de boards ou org. Sê conciso.`;

  const userBlock =
    (pageId ? (locale === "en" ? `Current help page id: ${pageId}\n` : `Página actual do manual: ${pageId}\n`) : "") +
    `Pergunta:\n${message}\n\nCONTEXTO:\n${block}`;

  const apiKey = platformManualLlmKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        reply:
          locale === "en"
            ? "The product manual assistant is not configured (no platform LLM key). You can still browse the manual in the app."
            : "O assistente do manual não está configurado (sem chave de LLM da plataforma). Ainda pode navegar no manual na app.",
        source: "no_key" as const,
        citations: chunks.map((c) => ({ slug: c.slug, section: c.sectionTitle, chunkId: c.chunkId })),
      },
      { status: 200 }
    );
  }

  const res = await callTogetherApi(
    {
      model: process.env.FLUX_MANUAL_ASK_MODEL?.trim() || "Qwen/Qwen2.5-7B-Instruct-Turbo",
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userBlock },
      ],
    },
    { apiKey }
  );

  if (!res.ok) {
    return NextResponse.json(
      {
        error: locale === "en" ? "The model could not answer. Try again." : "O modelo não respondeu. Tente de novo.",
        source: "error" as const,
      },
      { status: 502 }
    );
  }

  const rawBody = res.data as { choices?: Array<{ message?: { content?: unknown } }> } | null;
  const text = (
    res.assistantText.trim() ||
    extractTextFromLlmContent(rawBody?.choices?.[0]?.message?.content) ||
    ""
  ).trim();

  return NextResponse.json({
    reply: text.trim() || (locale === "en" ? "—" : "—"),
    source: "llm" as const,
    citations: chunks.map((c) => ({ slug: c.slug, section: c.sectionTitle, chunkId: c.chunkId })),
  });
}
