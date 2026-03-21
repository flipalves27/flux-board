import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, getBoardRebornId, userCanAccessBoard } from "@/lib/kv-boards";
import { sanitizeText } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { executeNlqPlan, parseNlqWithLlm, tryNlqHeuristic } from "@/lib/board-nlq";
import type { CopilotChatDocLike } from "@/lib/flux-reports-metrics";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { getBoardNlqRecentQueries, pushBoardNlqRecentQuery } from "@/lib/kv-board-nlq-cache";

export const runtime = "nodejs";

async function resolveBoardIdParam(requestedBoardId: string, orgId: string): Promise<string> {
  let boardId = requestedBoardId;
  if (requestedBoardId === "b_reborn") {
    const scopedRebornId = getBoardRebornId(orgId);
    if (scopedRebornId !== requestedBoardId) {
      const scopedBoard = await getBoard(scopedRebornId, orgId);
      if (scopedBoard) boardId = scopedRebornId;
    }
  }
  return boardId;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedId } = await params;
  if (!requestedId || requestedId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const boardId = await resolveBoardIdParam(requestedId, payload.orgId);
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const recent = await getBoardNlqRecentQueries({
    orgId: payload.orgId,
    userId: payload.id,
    boardId,
  });

  return NextResponse.json({ recent });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedId } = await params;
  if (!requestedId || requestedId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const boardId = await resolveBoardIdParam(requestedId, payload.orgId);
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { query?: string };
  const rawQuery = sanitizeText(body.query ?? "").trim().slice(0, 500);
  const query = guardUserPromptForLlm(rawQuery).text;
  if (!query) {
    return NextResponse.json({ error: "Consulta é obrigatória." }, { status: 400 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  let copilotChats: CopilotChatDocLike[] = [];
  if (isMongoConfigured()) {
    const db = await getDb();
    copilotChats = (await db
      .collection("board_copilot_chats")
      .find({ orgId: payload.orgId, boardId })
      .toArray()) as CopilotChatDocLike[];
  }

  const bucketOrder = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
  const bucketHints = bucketOrder
    .filter((b) => b && typeof b === "object")
    .map((b) => {
      const r = b as Record<string, unknown>;
      return { key: String(r.key || ""), label: String(r.label || r.key || "") };
    })
    .filter((b) => b.key);

  let plan = tryNlqHeuristic(query);
  let nlqLlmModel: string | undefined;
  if (!plan) {
    const parsed = await parseNlqWithLlm(query, bucketHints);
    if (parsed) {
      nlqLlmModel = parsed.model;
      if (parsed.plan) plan = parsed.plan;
    }
  }

  if (!plan) {
    const result = executeNlqPlan({
      board,
      plan: { kind: "unparseable" },
      copilotChats,
    });
    return NextResponse.json({ ...result, llmModel: nlqLlmModel });
  }

  const result = executeNlqPlan({ board, plan, copilotChats });

  if (result.ok) {
    await pushBoardNlqRecentQuery({
      orgId: payload.orgId,
      userId: payload.id,
      boardId,
      query,
    });
  }

  return NextResponse.json({ ...result, llmModel: nlqLlmModel });
}
