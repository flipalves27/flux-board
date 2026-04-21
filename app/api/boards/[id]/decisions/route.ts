import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { findSimilarDecisionsByText, insertBoardDecision, listBoardDecisions } from "@/lib/kv-board-decisions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Flux Decisions requer MongoDB." }, { status: 503 });
  }
  const decisions = await listBoardDecisions(payload.orgId, boardId);
  return NextResponse.json({ decisions });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Flux Decisions requer MongoDB." }, { status: 503 });
  }

  const body = (await request.json()) as {
    title?: string;
    context?: string;
    decision?: string;
    alternatives?: Array<{ option: string; reason_rejected: string }>;
    consequences?: string;
    relatedCardIds?: string[];
    tags?: string[];
    similarQuery?: string;
  };

  const title = String(body.title ?? "").trim();
  const decision = String(body.decision ?? "").trim();
  if (!title || !decision) {
    return NextResponse.json({ error: "title e decision são obrigatórios." }, { status: 400 });
  }

  const existing = await listBoardDecisions(payload.orgId, boardId, 120);
  const similar = findSimilarDecisionsByText(String(body.similarQuery ?? body.context ?? title), existing, 4);

  const rec = await insertBoardDecision({
    orgId: payload.orgId,
    boardId,
    authorId: payload.id,
    title,
    context: body.context,
    decision,
    alternatives: body.alternatives,
    consequences: body.consequences,
    relatedCardIds: body.relatedCardIds,
    tags: body.tags,
  });

  return NextResponse.json({ decision: rec, similar });
}
