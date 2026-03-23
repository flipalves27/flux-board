import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { listBoardActivity, parseBoardActivityAction } from "@/lib/kv-board-activity";
import { isMongoConfigured } from "@/lib/mongo";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getBoardActivityRetentionDays } from "@/lib/plan-gates";

function parseIsoDate(raw: string | null, label: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${label} inválida`);
  }
  return d;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const boardId = requestedBoardId;

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({
      entries: [],
      retentionDays: null,
      mongoConfigured: false,
      boardName: board.name,
    });
  }

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number.parseInt(limitRaw || "100", 10) || 100, 1), 1000);
  const userIdFilter = url.searchParams.get("userId")?.trim() || undefined;
  const actionRaw = url.searchParams.get("action");
  const action = parseBoardActivityAction(actionRaw);

  let from: Date | undefined;
  let to: Date | undefined;
  try {
    from = parseIsoDate(url.searchParams.get("from"), "Data inicial");
    to = parseIsoDate(url.searchParams.get("to"), "Data final");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Datas inválidas" }, { status: 400 });
  }

  if (actionRaw && !action) {
    return NextResponse.json({ error: "Parâmetro action inválido." }, { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  const retentionDays = getBoardActivityRetentionDays(org);
  const minTimestamp =
    retentionDays !== null ? new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000) : undefined;

  const entries = await listBoardActivity({
    boardId,
    orgId: payload.orgId,
    userId: userIdFilter,
    action,
    from,
    to,
    limit,
    minTimestamp,
  });

  return NextResponse.json({
    entries,
    retentionDays,
    mongoConfigured: true,
    boardName: board.name,
    boardId,
  });
}
