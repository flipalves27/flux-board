import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { createDoc } from "@/lib/kv-docs";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature, planGateCtxForAuth } from "@/lib/plan-gates";
import { logDocsMetric } from "@/lib/docs-metrics";

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const org = await getOrganizationById(payload.orgId);
  if (!canUseFeature(org, "flux_docs_rag", planGateCtxForAuth(payload.isAdmin)))
    return NextResponse.json({ error: "RAG indisponível no plano atual." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { boardId?: string; title?: string };
  const boardId = String(body.boardId || "").trim();
  if (!boardId) return NextResponse.json({ error: "boardId é obrigatório." }, { status: 400 });

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para o board." }, { status: 403 });
  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });

  const cards = Array.isArray(board.cards) ? board.cards : [];
  const markdown = [
    `# ${body.title?.trim() || `Status do board ${board.name || boardId}`}`,
    "",
    `Gerado automaticamente em ${new Date().toISOString()}.`,
    "",
    "## Cards",
    ...cards.map((c: any) => `- **${String(c.title || "")}** (${String(c.progress || "")} / ${String(c.priority || "")})`),
  ].join("\n");

  const doc = await createDoc({
    orgId: payload.orgId,
    title: body.title?.trim() || `Status ${String(board.name || boardId)}`,
    contentMd: markdown,
    tags: ["board-generated"],
  });
  logDocsMetric("docs.generate_from_board", { orgId: payload.orgId, boardId, docId: doc.id, cardsCount: cards.length });
  return NextResponse.json({ doc }, { status: 201 });
}
