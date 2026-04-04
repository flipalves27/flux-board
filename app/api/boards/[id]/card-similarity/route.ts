import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findSimilarBoardCards } from "@/lib/card-duplicate-similarity";
import { fetchTextEmbeddings } from "@/lib/embeddings-together";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { listEmbeddingsForOrgBoards } from "@/lib/kv-card-dependencies";
import { sanitizeText, zodErrorToMessage } from "@/lib/schemas";

const BodySchema = z.object({
  title: z.string().max(2000),
  description: z.string().max(12000).optional(),
  excludeCardId: z.string().max(200).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId) return NextResponse.json({ error: "Board inválido." }, { status: 400 });

  const boardId = requestedBoardId;

  const can = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!can) return NextResponse.json({ error: "Acesso negado ao board." }, { status: 403 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });

  const title = sanitizeText(parsed.data.title || "");
  const description = sanitizeText(parsed.data.description || "");
  const excludeCardId = parsed.data.excludeCardId?.trim() || undefined;

  try {
    const board = await getBoard(boardId, payload.orgId);
    if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });

    const embDocs = await listEmbeddingsForOrgBoards(payload.orgId, [boardId]);
    const embeddingByCardId = new Map<string, number[]>();
    for (const e of embDocs) {
      if (e.boardId === boardId && Array.isArray(e.embedding) && e.embedding.length) {
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
      excludeCardId,
      embeddingByCardId: embeddingByCardId.size ? embeddingByCardId : undefined,
      queryEmbedding,
    });

    return NextResponse.json({ matches });
  } catch (err) {
    console.error("card-similarity", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
