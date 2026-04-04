/**
 * Hub in-memory para SSE de presença / movimentos / locks por board.
 * Funciona em um único processo Node (dev, VPS, instância única).
 * Com `REDIS_URL`, mutações de board são também publicadas em Redis; ver `board-realtime-dispatch`.
 */

export const MAX_PEERS_PER_BOARD = 20;
export const STALE_MS = 90_000;

export type PresencePeer = {
  connectionId: string;
  userId: string;
  username: string;
  displayName: string;
  columnKey: string | null;
  lastSeen: number;
};

export type BucketMovePayload = { bucketKey: string; orderedCardIds: string[] };

export type CardMoveEventPayload = {
  fromUserId: string;
  /** Presente quando o emissor tinha SSE ligado — só para diagnóstico; clientes usam `fromUserId`. */
  fromConnectionId?: string;
  buckets: BucketMovePayload[];
};

export type ColumnReorderPayload = {
  fromUserId: string;
  fromConnectionId?: string;
  bucketKeys: string[];
};

export type CardLockPayload = {
  cardId: string;
  userId: string;
  userName: string;
  clientId: string;
  locked: boolean;
};

type ClientConn = {
  connectionId: string;
  boardId: string;
  userId: string;
  username: string;
  displayName: string;
  clientId: string;
  columnKey: string | null;
  lastSeen: number;
  write: (sseChunk: string) => void;
};

const byBoard = new Map<string, Map<string, ClientConn>>();
const locksByBoard = new Map<string, Map<string, { userId: string; userName: string; clientId: string }>>();

function boardMap(boardId: string): Map<string, ClientConn> {
  let m = byBoard.get(boardId);
  if (!m) {
    m = new Map();
    byBoard.set(boardId, m);
  }
  return m;
}

function locksFor(boardId: string): Map<string, { userId: string; userName: string; clientId: string }> {
  let m = locksByBoard.get(boardId);
  if (!m) {
    m = new Map();
    locksByBoard.set(boardId, m);
  }
  return m;
}

function safeWrite(c: ClientConn, event: string, data: unknown) {
  try {
    c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    /* stream closed */
  }
}

/** Envia um evento SSE a todas as ligações do board (exceto `excludeConnectionId` se definido). */
export function deliverSseToBoard(
  boardId: string,
  event: string,
  data: unknown,
  excludeConnectionId?: string
) {
  const m = byBoard.get(boardId);
  if (!m) return;
  for (const c of m.values()) {
    if (excludeConnectionId && c.connectionId === excludeConnectionId) continue;
    safeWrite(c, event, data);
  }
}

function presenceSnapshot(boardId: string): PresencePeer[] {
  const m = byBoard.get(boardId);
  if (!m) return [];
  const now = Date.now();
  const out: PresencePeer[] = [];
  for (const c of m.values()) {
    if (now - c.lastSeen > STALE_MS) continue;
    out.push({
      connectionId: c.connectionId,
      userId: c.userId,
      username: c.username,
      displayName: c.displayName,
      columnKey: c.columnKey,
      lastSeen: c.lastSeen,
    });
  }
  return out;
}

function broadcastPresence(boardId: string) {
  deliverSseToBoard(boardId, "presence", { peers: presenceSnapshot(boardId) });
}

function clearLocksForClient(boardId: string, clientId: string) {
  const L = locksByBoard.get(boardId);
  if (!L) return;
  for (const [cardId, v] of L) {
    if (v.clientId === clientId) {
      L.delete(cardId);
      deliverSseToBoard(boardId, "card_lock", {
        cardId,
        userId: v.userId,
        userName: v.userName,
        clientId,
        locked: false,
      } satisfies CardLockPayload);
    }
  }
}

export function cardLockCanApply(boardId: string, args: CardLockPayload): boolean {
  const L = locksFor(boardId);
  if (args.locked) {
    const prev = L.get(args.cardId);
    if (prev && prev.userId !== args.userId) {
      return false;
    }
    return true;
  }
  const prev = L.get(args.cardId);
  if (prev && prev.clientId !== args.clientId) {
    return false;
  }
  return true;
}

/** Aplica lock/unlock e envia SSE (origem fidedigna: POST local ou réplica Redis). */
export function applyCardLockFromEvent(boardId: string, args: CardLockPayload) {
  const L = locksFor(boardId);
  if (args.locked) {
    L.set(args.cardId, { userId: args.userId, userName: args.userName, clientId: args.clientId });
  } else {
    L.delete(args.cardId);
  }
  deliverSseToBoard(boardId, "card_lock", args);
}

export const boardRealtimeHub = {
  canAccept(boardId: string): boolean {
    this.pruneStale(boardId);
    const m = byBoard.get(boardId);
    return !m || m.size < MAX_PEERS_PER_BOARD;
  },

  pruneStale(boardId: string) {
    const m = byBoard.get(boardId);
    if (!m) return;
    const now = Date.now();
    for (const [id, c] of m) {
      if (now - c.lastSeen > STALE_MS) {
        m.delete(id);
        clearLocksForClient(boardId, c.clientId);
      }
    }
    if (m.size === 0) byBoard.delete(boardId);
  },

  connect(args: {
    boardId: string;
    userId: string;
    username: string;
    displayName: string;
    clientId: string;
    columnKey: string | null;
    write: (sseChunk: string) => void;
  }): { connectionId: string } | null {
    this.pruneStale(args.boardId);
    const m = boardMap(args.boardId);
    if (m.size >= MAX_PEERS_PER_BOARD) return null;

    const connectionId = crypto.randomUUID();
    const conn: ClientConn = {
      connectionId,
      boardId: args.boardId,
      userId: args.userId,
      username: args.username,
      displayName: args.displayName,
      clientId: args.clientId,
      columnKey: args.columnKey,
      lastSeen: Date.now(),
      write: args.write,
    };
    m.set(connectionId, conn);

    safeWrite(conn, "ready", { connectionId, locks: Object.fromEntries(locksFor(args.boardId)) });
    broadcastPresence(args.boardId);
    return { connectionId };
  },

  disconnect(boardId: string, connectionId: string) {
    const m = byBoard.get(boardId);
    if (!m) return;
    const c = m.get(connectionId);
    if (!c) return;
    m.delete(connectionId);
    clearLocksForClient(boardId, c.clientId);
    if (m.size === 0) byBoard.delete(boardId);
    broadcastPresence(boardId);
  },

  heartbeat(boardId: string, connectionId: string, columnKey: string | null): boolean {
    const m = byBoard.get(boardId);
    if (!m) return false;
    const c = m.get(connectionId);
    if (!c) return false;
    c.lastSeen = Date.now();
    c.columnKey = columnKey;
    broadcastPresence(boardId);
    return true;
  },

  /** POST sem SSE: atualiza só presença efêmera (não persiste). */
  touchByClient(boardId: string, userId: string, clientId: string, columnKey: string | null): boolean {
    const m = byBoard.get(boardId);
    if (!m) return false;
    for (const c of m.values()) {
      if (c.userId === userId && c.clientId === clientId) {
        c.lastSeen = Date.now();
        c.columnKey = columnKey;
        broadcastPresence(boardId);
        return true;
      }
    }
    return false;
  },

  clearLocksForClientPublic(boardId: string, clientId: string) {
    clearLocksForClient(boardId, clientId);
  },
};
