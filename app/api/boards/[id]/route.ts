import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  getBoard,
  getBoardRebornId,
  updateBoard,
  deleteBoard,
  userCanAccessBoard,
  isBoardRebornId,
} from "@/lib/kv-boards";
import { BoardUpdateSchema, sanitizeDeep, zodErrorToMessage } from "@/lib/schemas";
import { validateBoardWip } from "@/lib/board-wip";
import { runSyncAutomationsOnBoardPut } from "@/lib/automation-engine";
import { stripPortalForClient, applyPortalPatch, type PortalBoardPatch } from "@/lib/portal-settings";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  let boardId = requestedBoardId;
  if (requestedBoardId === "b_reborn") {
    const scopedRebornId = getBoardRebornId(payload.orgId);
    if (scopedRebornId !== requestedBoardId) {
      const scopedBoard = await getBoard(scopedRebornId, payload.orgId);
      if (scopedBoard) boardId = scopedRebornId;
    }
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  try {
    const board = await getBoard(boardId, payload.orgId);
    if (!board) {
      return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
    }
    const safe = {
      ...board,
      portal: stripPortalForClient(board.portal),
    };
    return NextResponse.json(safe);
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
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  let boardId = requestedBoardId;
  if (requestedBoardId === "b_reborn") {
    const scopedRebornId = getBoardRebornId(payload.orgId);
    if (scopedRebornId !== requestedBoardId) {
      const scopedBoard = await getBoard(scopedRebornId, payload.orgId);
      if (scopedBoard) boardId = scopedRebornId;
    }
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = BoardUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    // Sanitiza strings aninhadas vindas do cliente (ex.: titulo/desc em cards, tags, etc.)
    const clean = sanitizeDeep(parsed.data);

    const updates: Record<string, unknown> = {};
    if (clean.name !== undefined && !isBoardRebornId(boardId, payload.orgId)) {
      updates.name = String(clean.name || "").trim().slice(0, 100);
    }
    if (clean.cards !== undefined) {
      const prevBoard = await getBoard(boardId, payload.orgId);
      if (!prevBoard) {
        return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
      }
      const { cards } = await runSyncAutomationsOnBoardPut({
        prevBoard,
        nextCards: clean.cards as unknown[],
        boardId,
        orgId: payload.orgId,
        boardName: prevBoard.name,
      });
      const mergedBuckets =
        clean.config?.bucketOrder ?? (prevBoard.config as { bucketOrder?: { key: string; wipLimit?: number | null }[] })?.bucketOrder ?? [];
      const wipCheck = validateBoardWip(mergedBuckets, cards as { bucket: string }[]);
      if (!wipCheck.ok) {
        return NextResponse.json({ error: wipCheck.message }, { status: 400 });
      }
      updates.cards = cards;
    }
    if (clean.config !== undefined) {
      const prevForWip = await getBoard(boardId, payload.orgId);
      if (prevForWip?.cards?.length && clean.config.bucketOrder?.length) {
        const wipOnlyConfig = validateBoardWip(clean.config.bucketOrder, prevForWip.cards as { bucket: string }[]);
        if (!wipOnlyConfig.ok) {
          return NextResponse.json({ error: wipOnlyConfig.message }, { status: 400 });
        }
      }
      updates.config = clean.config;
    }
    if (clean.mapaProducao !== undefined) updates.mapaProducao = clean.mapaProducao;
    if (clean.dailyInsights !== undefined) updates.dailyInsights = clean.dailyInsights;
    if (clean.version !== undefined) updates.version = clean.version;
    if (clean.lastUpdated !== undefined) updates.lastUpdated = clean.lastUpdated;
    if (clean.clientLabel !== undefined) {
      updates.clientLabel = String(clean.clientLabel ?? "").trim().slice(0, 120);
    }

    if (clean.portal !== undefined) {
      const prevBoard = await getBoard(boardId, payload.orgId);
      if (!prevBoard) {
        return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
      }
      const portalPatch = sanitizeDeep(clean.portal) as PortalBoardPatch;
      const { portal: nextPortal } = await applyPortalPatch(prevBoard, portalPatch);
      updates.portal = nextPortal;
    }

    if (clean.anomalyNotifications !== undefined) {
      if (clean.anomalyNotifications === null) {
        updates.anomalyNotifications = undefined;
      } else {
        updates.anomalyNotifications = clean.anomalyNotifications;
      }
    }

    const board = await updateBoard(boardId, payload.orgId, updates, {
      userId: payload.id,
      userName: payload.username,
      orgId: payload.orgId,
    });
    if (!board) {
      return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      lastUpdated: board.lastUpdated,
      cardsCount: (board.cards || []).length,
      ...(clean.cards !== undefined ? { cards: board.cards } : {}),
      ...(clean.portal !== undefined ? { portal: stripPortalForClient(board.portal) } : {}),
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
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  let boardId = requestedBoardId;
  if (requestedBoardId === "b_reborn") {
    const scopedRebornId = getBoardRebornId(payload.orgId);
    if (scopedRebornId !== requestedBoardId) {
      const scopedBoard = await getBoard(scopedRebornId, payload.orgId);
      if (scopedBoard) boardId = scopedRebornId;
    }
  }

  if (isBoardRebornId(boardId, payload.orgId) && !payload.isAdmin) {
    return NextResponse.json(
      { error: "O Board-Reborn não pode ser excluído" },
      { status: 400 }
    );
  }

  try {
    const ok = await deleteBoard(boardId, payload.orgId, payload.id, payload.isAdmin);
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
