import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  getBoardIds,
  getBoardsByIds,
  createBoard,
  ensureBoardReborn,
  getDefaultBoardData,
  getBoardRebornId,
} from "@/lib/kv-boards";
import {
  computeBoardPortfolio,
  type PortfolioBoardLike,
} from "@/lib/board-portfolio-metrics";
import { ensureAdminUser } from "@/lib/kv-users";
import { BoardCreateSchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";
import { getOrganizationById } from "@/lib/kv-organizations";

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
    const org = await getOrganizationById(payload.orgId);
    await ensureBoardReborn(payload.orgId, org?.ownerId ?? payload.id, getDefaultBoardData);

    const boardIds = await getBoardIds(payload.id, payload.orgId, payload.isAdmin);
    const boardRows = await getBoardsByIds(boardIds, payload.orgId);
    const boards = boardRows.map((b) => ({
      id: b.id,
      name: b.name,
      ownerId: b.ownerId,
      clientLabel: typeof b.clientLabel === "string" ? b.clientLabel : undefined,
      lastUpdated: b.lastUpdated,
      portfolio: computeBoardPortfolio(b as PortfolioBoardLike),
    }));

    const rebornId = getBoardRebornId(payload.orgId);
    // Contagem de boards deve ser por organização (não apenas pelo usuário).
    const orgBoardIds = await getBoardIds(payload.id, payload.orgId, true);
    const currentCount = orgBoardIds.filter((id) => id !== rebornId).length;
    const cap = org?.plan === "free" ? org.maxBoards : null;
    const isPro = cap === null;

    const plan =
      {
        maxBoards: cap,
        isPro,
        currentCount,
        atLimit: cap !== null && currentCount >= cap,
      };
    return NextResponse.json({ boards, plan });
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
    const org = await getOrganizationById(payload.orgId);
    await ensureBoardReborn(payload.orgId, org?.ownerId ?? payload.id, getDefaultBoardData);

    const body = await request.json();
    const parsed = BoardCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const name = (sanitizeText(parsed.data.name ?? "Novo Board").trim().slice(0, 100) || "Novo Board").trim();

    const rebornId = getBoardRebornId(payload.orgId);
    const cap = org?.plan === "free" ? org.maxBoards : null;
    if (cap !== null) {
      const existingIds = await getBoardIds(payload.id, payload.orgId, true);
      const currentCount = existingIds.filter((id) => id !== rebornId).length;
      if (currentCount >= cap) {
        return NextResponse.json(
          { error: `Limite do plano: no máximo ${cap} board(s) por organização.` },
          { status: 403 }
        );
      }
    }

    const board = await createBoard(payload.orgId, payload.id, name, {
      version: "2.0",
      cards: [],
      config: { bucketOrder: [], collapsedColumns: [] },
      mapaProducao: [],
      dailyInsights: [],
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
