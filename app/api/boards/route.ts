import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  getBoardIds,
  getBoard,
  createBoard,
  ensureBoardReborn,
  getDefaultBoardData,
} from "@/lib/kv-boards";
import { ensureAdminUser } from "@/lib/kv-users";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    await ensureBoardReborn("admin", getDefaultBoardData);

    const boardIds = await getBoardIds(payload.id, payload.isAdmin);
    const boards = [];
    for (const bid of boardIds) {
      const b = await getBoard(bid);
      if (b) boards.push({ id: b.id, name: b.name, ownerId: b.ownerId, lastUpdated: b.lastUpdated });
    }
    return NextResponse.json({ boards });
  } catch (err) {
    console.error("Boards API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    await ensureBoardReborn("admin", getDefaultBoardData);

    const body = await request.json();
    const name = (body.name || "Novo Board").trim().slice(0, 100);

    const board = await createBoard(payload.id, name, {
      version: "2.0",
      cards: [],
      config: { bucketOrder: [], collapsedColumns: [] },
      mapaProducao: [],
    });
    return NextResponse.json(
      {
        board: {
          id: board.id,
          name: board.name,
          ownerId: board.ownerId,
          lastUpdated: board.lastUpdated,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Boards API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
