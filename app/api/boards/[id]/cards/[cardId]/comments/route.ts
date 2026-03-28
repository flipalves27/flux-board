import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { listComments, createComment, deleteComment, addReaction } from "@/lib/kv-comments";
import { CommentCreateSchema, zodErrorToMessage } from "@/lib/schemas";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; cardId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try { assertFeatureAllowed(org, "card_comments", gateCtx); } catch {
    return NextResponse.json({ error: "Disponível em planos pagos." }, { status: 403 });
  }

  const comments = await listComments(payload.orgId, boardId, cardId);
  return NextResponse.json({ comments });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try { assertFeatureAllowed(org, "card_comments", gateCtx); } catch {
    return NextResponse.json({ error: "Disponível em planos pagos." }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = CommentCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });

  const comment = await createComment({
    orgId: payload.orgId,
    boardId,
    cardId,
    authorId: payload.id,
    body: parsed.data.body,
    parentCommentId: parsed.data.parentCommentId ?? null,
    mentions: parsed.data.mentions ?? [],
  });

  return NextResponse.json({ comment }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const url = new URL(request.url);
  const commentId = url.searchParams.get("commentId");
  if (!commentId) return NextResponse.json({ error: "commentId obrigatório" }, { status: 400 });

  await deleteComment(payload.orgId, boardId, cardId, commentId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  let body: { commentId?: string; emoji?: string } = {};
  try { body = await request.json() as { commentId?: string; emoji?: string }; } catch { /* ignore */ }

  const { commentId, emoji } = body;
  if (!commentId || !emoji) return NextResponse.json({ error: "commentId e emoji obrigatórios" }, { status: 400 });

  const updated = await addReaction(payload.orgId, cardId, commentId, emoji, payload.id);
  if (!updated) return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
  return NextResponse.json({ comment: updated });
}
