import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import type {
  BoardRealtimeEnvelopeV1,
  DragMoveSsePayload,
  DragOverKind,
} from "@/lib/board-realtime-envelope";
import { boardRealtimeHub, cardLockCanApply } from "@/lib/board-realtime-hub";
import { publishOrDeliverBoardEvent } from "@/lib/board-realtime-redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function resolveBoardId(requestedBoardId: string): string | null {
  if (!requestedBoardId || requestedBoardId === "boards") return null;
  return requestedBoardId;
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
  action?:
    | "heartbeat"
    | "card_move"
    | "column_reorder"
    | "lock"
    | "unlock"
    | "drag_start"
    | "drag_move"
    | "drag_end";
  buckets?: Array<{ bucketKey: string; orderedCardIds: string[] }>;
  bucketKeys?: string[];
  cardId?: string;
  cardIds?: unknown;
  overKind?: unknown;
  bucketKey?: unknown;
  slotIndex?: unknown;
  overCardId?: unknown;
};

const MAX_DRAG_CARDS = 50;
const MAX_ID_LEN = 200;

function normalizeDragCardIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (raw.length > MAX_DRAG_CARDS) return null;
  const out: string[] = [];
  for (const x of raw) {
    const s = typeof x === "string" ? x.trim() : "";
    if (!s) return null;
    if (s.length > MAX_ID_LEN) return null;
    out.push(s);
  }
  return out;
}

function parseDragOverKind(raw: unknown): DragOverKind | null {
  if (raw === "bucket" || raw === "slot" || raw === "card") return raw;
  return null;
}

function validateDragMovePayload(body: PostBody, fromUserId: string): DragMoveSsePayload | null {
  const overKind = parseDragOverKind(body.overKind);
  if (!overKind) return null;

  const bucketKeyRaw = body.bucketKey;
  const slotRaw = body.slotIndex;
  const overCardRaw = body.overCardId;

  if (overKind === "bucket") {
    const bucketKey =
      typeof bucketKeyRaw === "string" ? bucketKeyRaw.trim().slice(0, MAX_ID_LEN) : "";
    if (!bucketKey) return null;
    return { fromUserId, overKind: "bucket", bucketKey };
  }

  if (overKind === "slot") {
    const bucketKey =
      typeof bucketKeyRaw === "string" ? bucketKeyRaw.trim().slice(0, MAX_ID_LEN) : "";
    if (!bucketKey) return null;
    const slotIndex = typeof slotRaw === "number" && Number.isFinite(slotRaw) ? Math.floor(slotRaw) : NaN;
    if (slotIndex < 0 || slotIndex > 1_000_000) return null;
    return { fromUserId, overKind: "slot", bucketKey, slotIndex };
  }

  const overCardId =
    typeof overCardRaw === "string" ? overCardRaw.trim().slice(0, MAX_ID_LEN) : "";
  if (!overCardId) return null;
  return { fromUserId, overKind: "card", overCardId };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  const boardId = resolveBoardId(requestedBoardId);
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
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  const boardId = resolveBoardId(requestedBoardId);
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

  const excludeConnectionId = connectionId.trim() ? connectionId : undefined;

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
    const env: BoardRealtimeEnvelopeV1 = {
      v: 1,
      type: "card_move",
      boardId,
      ...(excludeConnectionId ? { excludeConnectionId } : {}),
      payload: { fromUserId: payload.id, buckets: normalized },
    };
    await publishOrDeliverBoardEvent(env);
    return NextResponse.json({ ok: true });
  }

  if (action === "column_reorder") {
    const bucketKeys = Array.isArray(body.bucketKeys) ? body.bucketKeys.map((k) => String(k)) : [];
    if (bucketKeys.length === 0) {
      return NextResponse.json({ error: "bucketKeys inválido" }, { status: 400 });
    }
    const env: BoardRealtimeEnvelopeV1 = {
      v: 1,
      type: "column_reorder",
      boardId,
      ...(excludeConnectionId ? { excludeConnectionId } : {}),
      payload: { fromUserId: payload.id, bucketKeys },
    };
    await publishOrDeliverBoardEvent(env);
    return NextResponse.json({ ok: true });
  }

  if (action === "drag_start") {
    const cardIds = normalizeDragCardIds(body.cardIds);
    if (!cardIds) {
      return NextResponse.json({ error: "cardIds inválido" }, { status: 400 });
    }
    const env: BoardRealtimeEnvelopeV1 = {
      v: 1,
      type: "drag_start",
      boardId,
      ...(excludeConnectionId ? { excludeConnectionId } : {}),
      payload: {
        fromUserId: payload.id,
        ...(excludeConnectionId ? { fromConnectionId: excludeConnectionId } : {}),
        cardIds,
      },
    };
    await publishOrDeliverBoardEvent(env);
    return NextResponse.json({ ok: true });
  }

  if (action === "drag_move") {
    const move = validateDragMovePayload(body, payload.id);
    if (!move) {
      return NextResponse.json({ error: "drag_move inválido" }, { status: 400 });
    }
    const env: BoardRealtimeEnvelopeV1 = {
      v: 1,
      type: "drag_move",
      boardId,
      ...(excludeConnectionId ? { excludeConnectionId } : {}),
      payload: move,
    };
    await publishOrDeliverBoardEvent(env);
    return NextResponse.json({ ok: true });
  }

  if (action === "drag_end") {
    const env: BoardRealtimeEnvelopeV1 = {
      v: 1,
      type: "drag_end",
      boardId,
      ...(excludeConnectionId ? { excludeConnectionId } : {}),
      payload: { fromUserId: payload.id },
    };
    await publishOrDeliverBoardEvent(env);
    return NextResponse.json({ ok: true });
  }

  if (!connectionId.trim()) {
    return NextResponse.json({ error: "connectionId é obrigatório para lock/unlock" }, { status: 400 });
  }

  if (action === "lock" || action === "unlock") {
    const cardId = typeof body.cardId === "string" ? body.cardId.trim() : "";
    if (!cardId) {
      return NextResponse.json({ error: "cardId é obrigatório" }, { status: 400 });
    }
    const userName = displayName;
    const lockPayload = {
      cardId,
      userId: payload.id,
      userName,
      clientId,
      locked: action === "lock",
    };
    if (!cardLockCanApply(boardId, lockPayload)) {
      return NextResponse.json({ ok: false, conflict: true }, { status: 409 });
    }
    const env: BoardRealtimeEnvelopeV1 = {
      v: 1,
      type: "card_lock",
      boardId,
      payload: lockPayload,
    };
    await publishOrDeliverBoardEvent(env);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
