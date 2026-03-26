import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoardFromExisting, userCanAccessBoard } from "@/lib/kv-boards";
import { getDocById } from "@/lib/kv-docs";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature, planGateCtxForAuth } from "@/lib/plan-gates";
import { logDocsMetric } from "@/lib/docs-metrics";

function summarize(md: string, max = 320): string {
  const text = String(md || "").replace(/[#>*`~_-]/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, max);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const org = await getOrganizationById(payload.orgId);
  if (!canUseFeature(org, "flux_docs_rag", planGateCtxForAuth(payload.isAdmin, payload.isExecutive)))
    return NextResponse.json({ error: "RAG indisponível no plano atual." }, { status: 403 });

  const { id: docId } = await params;
  const body = (await request.json().catch(() => ({}))) as { boardId?: string; cardId?: string };
  const boardId = String(body.boardId || "").trim();
  const cardId = String(body.cardId || "").trim();
  if (!boardId || !cardId) return NextResponse.json({ error: "boardId e cardId são obrigatórios." }, { status: 400 });

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para o board." }, { status: 403 });
  const [board, doc] = await Promise.all([getBoard(boardId, payload.orgId), getDocById(payload.orgId, docId)]);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });
  if (!doc) return NextResponse.json({ error: "Doc não encontrado." }, { status: 404 });

  const cards = Array.isArray(board.cards) ? [...board.cards] : [];
  const idx = cards.findIndex((c: any) => String(c.id) === cardId);
  if (idx < 0) return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });
  const snippet = summarize(doc.contentMd);
  const currentDesc = String((cards[idx] as any).desc || "");
  (cards[idx] as any).desc = [currentDesc, "", `Resumo de doc (${doc.title}):`, snippet].join("\n").trim();
  const refs = Array.isArray((cards[idx] as any).docRefs) ? (cards[idx] as any).docRefs : [];
  if (!refs.some((r: any) => String(r?.docId) === doc.id)) {
    (cards[idx] as any).docRefs = [...refs, { docId: doc.id, title: doc.title, excerpt: doc.excerpt }];
  }

  const nextBoard = await updateBoardFromExisting(board, { cards }, {
    userId: payload.id,
    userName: payload.username,
    orgId: payload.orgId,
  });
  logDocsMetric("docs.summarize_to_card", { orgId: payload.orgId, boardId, docId, cardId });
  return NextResponse.json({ ok: true, cards: nextBoard.cards });
}
