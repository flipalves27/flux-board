import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, getBoardRebornId, userCanAccessBoard } from "@/lib/kv-boards";
import { boardRealtimeHub } from "@/lib/board-realtime-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

async function resolveBoardId(
  requestedBoardId: string,
  orgId: string
): Promise<string | null> {
  if (!requestedBoardId || requestedBoardId === "boards") return null;
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

function parseSseQuery(req: NextRequest): { clientId: string | null; columnKey: string | null } {
  const u = new URL(req.url);
  const clientId = u.searchParams.get("clientId");
  const col = u.searchParams.get("columnKey");
  return { clientId, columnKey: col };
}

type PostBody = {
  clientId?: string;
  connectionId?: string;
  columnKey?: string | null;
  action?: "heartbeat" | "card_move" | "column_reorder" | "lock" | "unlock";
  buckets?: Array<{ bucketKey: string; orderedCardIds: string[] }>;
  bucketKeys?: string[];
  cardId?: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  const boardId = await resolveBoardId(requestedBoardId, payload.orgId);
  if (!boardId) {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const { clientId, columnKey } = parseSseQuery(request);
  if (!clientId || clientId.length < 8) {
    return NextResponse.json({ error: "clientId é obrigatório (query)" }, { status: 400 });
  }

  boardRealtimeHub.pruneStale(boardId);
  if (!boardRealtimeHub.canAccept(boardId)) {
    return NextResponse.json({ error: "Limite de colaboradores no board (máx. 20)" }, { status: 503 });
  }

  const displayName =
    (request.headers.get("x-flux-display-name") || "").trim() || payload.username;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* closed */
        }
      };

      const result = boardRealtimeHub.connect({
        boardId,
        userId: payload.id,
        username: payload.username,
        displayName,
        clientId,
        columnKey: columnKey || null,
        write,
      });

      if (!result) {
        write(`event: error\ndata: ${JSON.stringify({ message: "full" })}\n\n`);
        try {
          controller.close();
        } catch {
          /* */
        }
        return;
      }

      const onAbort = () => {
        boardRealtimeHub.disconnect(boardId, result.connectionId);
        try {
          controller.close();
        } catch {
          /* */
        }
      };

      request.signal.addEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  const boardId = await resolveBoardId(requestedBoardId, payload.orgId);
  if (!boardId) {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  if (!clientId) {
    return NextResponse.json({ error: "clientId é obrigatório" }, { status: 400 });
  }

  const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
  const columnKey =
    body.columnKey === undefined || body.columnKey === null
      ? null
      : String(body.columnKey).slice(0, 200);

  const action = body.action ?? "heartbeat";

  if (action === "heartbeat") {
    if (connectionId) {
      const ok = boardRealtimeHub.heartbeat(boardId, connectionId, columnKey);
      if (!ok) {
        const touched = boardRealtimeHub.touchByClient(boardId, payload.id, clientId, columnKey);
        if (!touched) {
          return NextResponse.json({ ok: false, reason: "no_connection" }, { status: 200 });
        }
      }
    } else {
      boardRealtimeHub.touchByClient(boardId, payload.id, clientId, columnKey);
    }
    return NextResponse.json({ ok: true });
  }

  if (!connectionId) {
    return NextResponse.json({ error: "connectionId é obrigatório para esta ação" }, { status: 400 });
  }

  const displayName =
    (request.headers.get("x-flux-display-name") || "").trim() || payload.username;

  if (action === "card_move") {
    const buckets = Array.isArray(body.buckets) ? body.buckets : [];
    const normalized = buckets
      .map((b) => ({
        bucketKey: String(b.bucketKey || "").slice(0, 200),
        orderedCardIds: Array.isArray(b.orderedCardIds)
          ? b.orderedCardIds.map((id) => String(id)).filter(Boolean)
          : [],
      }))
      .filter((b) => b.bucketKey);
    if (normalized.length === 0) {
      return NextResponse.json({ error: "buckets inválido" }, { status: 400 });
    }
    boardRealtimeHub.broadcastCardMove(boardId, connectionId, {
      fromUserId: payload.id,
      buckets: normalized,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "column_reorder") {
    const bucketKeys = Array.isArray(body.bucketKeys) ? body.bucketKeys.map((k) => String(k)) : [];
    if (bucketKeys.length === 0) {
      return NextResponse.json({ error: "bucketKeys inválido" }, { status: 400 });
    }
    boardRealtimeHub.broadcastColumnReorder(boardId, connectionId, {
      fromUserId: payload.id,
      bucketKeys,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "lock" || action === "unlock") {
    const cardId = typeof body.cardId === "string" ? body.cardId.trim() : "";
    if (!cardId) {
      return NextResponse.json({ error: "cardId é obrigatório" }, { status: 400 });
    }
    const userName = displayName;
    const r = boardRealtimeHub.setCardLock(boardId, {
      cardId,
      userId: payload.id,
      userName,
      clientId,
      locked: action === "lock",
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, conflict: true }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
