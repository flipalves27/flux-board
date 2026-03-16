import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  getBoard,
  updateBoard,
  deleteBoard,
  userCanAccessBoard,
  BOARD_REBORN_ID,
} from "@/lib/kv-boards";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  try {
    const board = await getBoard(boardId);
    if (!board) {
      return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
    }
    return NextResponse.json(board);
  } catch (err) {
    console.error("Board API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined && boardId !== BOARD_REBORN_ID) {
      updates.name = (body.name || "").trim().slice(0, 100);
    }
    if (body.cards !== undefined) updates.cards = body.cards;
    if (body.config !== undefined) updates.config = body.config;
    if (body.mapaProducao !== undefined) updates.mapaProducao = body.mapaProducao;
    if (body.version !== undefined) updates.version = body.version;
    if (body.lastUpdated !== undefined) updates.lastUpdated = body.lastUpdated;

    const board = await updateBoard(boardId, updates);
    if (!board) {
      return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      lastUpdated: board.lastUpdated,
      cardsCount: (board.cards || []).length,
    });
  } catch (err) {
    console.error("Board API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  if (boardId === BOARD_REBORN_ID && !payload.isAdmin) {
    return NextResponse.json(
      { error: "O Board-Reborn não pode ser excluído" },
      { status: 400 }
    );
  }

  try {
    const ok = await deleteBoard(boardId, payload.id, payload.isAdmin);
    if (!ok) {
      return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Board API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
