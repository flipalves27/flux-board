import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findSimilarBoardCards } from "@/lib/card-duplicate-similarity";
import { fetchTextEmbeddings } from "@/lib/embeddings-together";
import { getBoard } from "@/lib/kv-boards";
import { getIntakeFormIndexBySlug } from "@/lib/kv-intake-forms";
import { listEmbeddingsForOrgBoards } from "@/lib/kv-card-dependencies";
import { sanitizeText, zodErrorToMessage } from "@/lib/schemas";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { normalizeFormSlug } from "@/lib/forms-intake";
import { publicApiErrorResponse } from "@/lib/public-api-error";

const BodySchema = z.object({
  title: z.string().max(2000),
  description: z.string().max(12000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = normalizeFormSlug(rawSlug);
  if (!slug) return NextResponse.json({ error: "Slug inválido." }, { status: 400 });

  const index = await getIntakeFormIndexBySlug(slug);
  if (!index || !index.enabled) return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });

  const board = await getBoard(index.boardId, index.orgId);
  if (!board || !(board as { intakeForm?: { enabled?: boolean } }).intakeForm?.enabled) {
    return NextResponse.json({ error: "Formulário indisponível." }, { status: 404 });
  }

  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({
    key: `forms:similar:${slug}:${ip}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas consultas. Aguarde um momento." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });

  const title = sanitizeText(parsed.data.title || "");
  const description = sanitizeText(parsed.data.description || "");

  try {
    const embDocs = await listEmbeddingsForOrgBoards(index.orgId, [index.boardId]);
    const embeddingByCardId = new Map<string, number[]>();
    for (const e of embDocs) {
      if (e.boardId === index.boardId && Array.isArray(e.embedding) && e.embedding.length) {
        embeddingByCardId.set(e.cardId, e.embedding);
      }
    }

    let queryEmbedding: number[] | null = null;
    if (embeddingByCardId.size > 0 && process.env.TOGETHER_API_KEY) {
      const qText = `${title}\n${description}`.trim().slice(0, 8000);
      if (qText.length >= 8) {
        const emb = await fetchTextEmbeddings([qText]);
        queryEmbedding = emb?.[0] ?? null;
      }
    }

    const matches = findSimilarBoardCards({
      board,
      queryTitle: title,
      queryDescription: description,
      limit: 3,
      embeddingByCardId: embeddingByCardId.size ? embeddingByCardId : undefined,
      queryEmbedding,
    });

    return NextResponse.json({ matches });
  } catch (err) {
    console.error("forms similar-cards", err);
    return publicApiErrorResponse(err, { context: "api/forms/[slug]/similar-cards/route.ts" });
  }
}
