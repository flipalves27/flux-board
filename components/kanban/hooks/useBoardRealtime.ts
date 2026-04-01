"use client";

import { useCallback, useEffect, useRef } from "react";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { BoardData, BucketConfig, CardData } from "@/app/board/[id]/page";
import { useBoardStore } from "@/stores/board-store";
import { useBoardCollabStore } from "@/stores/board-collab-store";
import type {
  BucketMovePayload,
  CardLockPayload,
  CardMoveEventPayload,
  ColumnReorderPayload,
  PresencePeer,
} from "@/lib/board-realtime-hub";
import type { DragEndSsePayload, DragMoveSsePayload, DragStartSsePayload } from "@/lib/board-realtime-envelope";
import type { DragMovePostFields } from "@/components/kanban/kanban-dnd-utils";

/** Sincronização por `lastUpdated` enquanto SSE está ativa (multi-instância / eventos perdidos). */
const BOARD_POLL_MS_WITH_SSE = 5000;
/** Throttle de `drag_move` para o servidor (ms). */
const DRAG_MOVE_THROTTLE_MS = 80;
/** Após falha ou fim da stream SSE. */
const BOARD_POLL_MS_FALLBACK = 4000;

function parseSseBlocks(buffer: string): { events: Array<{ event: string; data: string }>; rest: string } {
  const events: Array<{ event: string; data: string }> = [];
  let rest = buffer;
  const parts = buffer.split(/\r?\n\r?\n/);
  rest = parts.pop() ?? "";
  for (const block of parts) {
    if (!block.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length) events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

function applyRemoteBuckets(buckets: BucketMovePayload[], fromUserId: string, selfId: string) {
  if (fromUserId === selfId) return;
  useBoardStore.getState().updateDbSilent((d) => {
    for (const { bucketKey, orderedCardIds } of buckets) {
      const set = new Set(orderedCardIds);
      let o = 0;
      for (const id of orderedCardIds) {
        const c = d.cards.find((x) => x.id === id);
        if (c) {
          c.bucket = bucketKey;
          c.order = o++;
        }
      }
      const extras = d.cards.filter((c) => c.bucket === bucketKey && !set.has(c.id));
      extras.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const c of extras) {
        c.order = o++;
      }
    }
  });
}

function applyRemoteColumnReorder(bucketKeys: string[], fromUserId: string, selfId: string) {
  if (fromUserId === selfId) return;
  useBoardStore.getState().updateDbSilent((d) => {
    const byKey = new Map(d.config.bucketOrder.map((b) => [b.key, b]));
    const next: BucketConfig[] = [];
    for (const k of bucketKeys) {
      const b = byKey.get(k);
      if (b) next.push(b);
    }
    for (const b of d.config.bucketOrder) {
      if (!bucketKeys.includes(b.key)) next.push(b);
    }
    if (next.length) d.config.bucketOrder = next;
  });
}

type UseBoardRealtimeArgs = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  userId: string;
  displayName: string;
  /** Quando false, polling não sobrescreve o board (ex.: salvando). */
  allowExternalMerge: boolean;
  visibleColumnKey: string | null;
};

export function useBoardRealtime({
  boardId,
  getHeaders,
  userId,
  displayName,
  allowExternalMerge,
  visibleColumnKey,
}: UseBoardRealtimeArgs) {
  const clientIdRef = useRef<string>("");
  if (!clientIdRef.current && typeof crypto !== "undefined" && crypto.randomUUID) {
    clientIdRef.current = crypto.randomUUID();
  }
  if (!clientIdRef.current) {
    clientIdRef.current = `cid_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  const connectionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDragMoveSentAt = useRef(0);
  const pendingDragMoveFields = useRef<DragMovePostFields | null>(null);
  const dragMoveThrottleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPresence = useBoardCollabStore((s) => s.setPresence);
  const setSseConnected = useBoardCollabStore((s) => s.setSseConnected);
  const setPollingFallback = useBoardCollabStore((s) => s.setPollingFallback);
  const setConnectionMeta = useBoardCollabStore((s) => s.setConnectionMeta);
  const setLocksFromServer = useBoardCollabStore((s) => s.setLocksFromServer);
  const applyLockEvent = useBoardCollabStore((s) => s.applyLockEvent);
  const applyRemoteDragStart = useBoardCollabStore((s) => s.applyRemoteDragStart);
  const applyRemoteDragMove = useBoardCollabStore((s) => s.applyRemoteDragMove);
  const applyRemoteDragEnd = useBoardCollabStore((s) => s.applyRemoteDragEnd);
  const resetCollab = useBoardCollabStore((s) => s.reset);

  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const allowMergeRef = useRef(allowExternalMerge);
  allowMergeRef.current = allowExternalMerge;

  const pollBoard = useCallback(async () => {
    if (!allowMergeRef.current) return;
    const expectedBoardId = boardId;
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(expectedBoardId)}`, {
        cache: "no-store",
        headers: getHeaders(),
      });
      if (!res.ok) return;
      if (useBoardStore.getState().boardId !== expectedBoardId) return;
      const data = (await res.json()) as BoardData & { cards?: unknown[]; lastUpdated?: string };
      if (useBoardStore.getState().boardId !== expectedBoardId) return;
      const local = useBoardStore.getState().db;
      if (!local || !data.lastUpdated || data.lastUpdated === local.lastUpdated) return;
      if (!Array.isArray(data.cards)) return;
      const cards = data.cards as CardData[];
      useBoardStore.getState().updateDbSilent((d) => {
        d.lastUpdated = data.lastUpdated || d.lastUpdated;
        d.cards = cards.map((c, i) => ({
          ...c,
          order: c.order ?? i,
          dueDate: c.dueDate ?? null,
          blockedBy: Array.isArray(c.blockedBy)
            ? [...new Set(c.blockedBy.filter((id) => typeof id === "string" && id.trim()))]
            : [],
          direction: c.direction ?? null,
          tags: Array.isArray(c.tags) ? c.tags : [],
          links: Array.isArray(c.links) ? c.links.filter((l) => l && typeof l.url === "string" && l.url.trim()) : [],
          docRefs: Array.isArray(c.docRefs)
            ? c.docRefs
                .filter((x) => x && typeof x.docId === "string" && x.docId.trim())
                .map((x) => ({
                  docId: String(x.docId),
                  title: x.title ? String(x.title) : undefined,
                  excerpt: x.excerpt ? String(x.excerpt) : undefined,
                }))
            : [],
        }));
        if (data.config) {
          d.config = {
            bucketOrder: data.config.bucketOrder || d.config.bucketOrder,
            collapsedColumns: data.config.collapsedColumns || [],
            labels: data.config.labels?.length ? data.config.labels : d.config.labels,
          };
        }
      });
    } catch {
      /* ignore */
    }
  }, [boardId, getHeaders]);

  useEffect(() => {
    if (!userId) {
      resetCollab();
      connectionIdRef.current = null;
      setConnectionMeta(null, null);
      return;
    }

    resetCollab();
    connectionIdRef.current = null;
    setConnectionMeta(null, null);

    const clientId = clientIdRef.current;
    const url = `/api/boards/${encodeURIComponent(boardId)}/presence?clientId=${encodeURIComponent(clientId)}`;
    const ac = new AbortController();
    abortRef.current = ac;

    function startBoardPollInterval(ms: number) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      void pollBoard();
      pollRef.current = setInterval(() => void pollBoard(), ms);
    }

    let buf = "";

    function dispatchEvent(eventName: string, raw: string) {
      if (eventName === "presence") {
        try {
          const j = JSON.parse(raw) as { peers?: unknown };
          if (Array.isArray(j.peers)) {
            setPresence(j.peers as PresencePeer[]);
          }
        } catch {
          /* ignore */
        }
        return;
      }
      if (eventName === "ready") {
        try {
          const j = JSON.parse(raw) as {
            connectionId?: string;
            locks?: Record<string, { userId: string; userName: string }>;
          };
          if (j.connectionId) {
            connectionIdRef.current = j.connectionId;
            setConnectionMeta(j.connectionId, clientIdRef.current);
          }
          if (j.locks && typeof j.locks === "object") {
            const mapped: Record<string, { userId: string; userName: string }> = {};
            for (const [k, v] of Object.entries(j.locks)) {
              if (v && typeof v.userId === "string") {
                mapped[k] = { userId: v.userId, userName: String(v.userName ?? "") };
              }
            }
            setLocksFromServer(mapped);
          }
        } catch {
          /* ignore */
        }
        return;
      }
      if (eventName === "card_move") {
        try {
          const p = JSON.parse(raw) as CardMoveEventPayload;
          applyRemoteBuckets(p.buckets ?? [], p.fromUserId, userIdRef.current);
        } catch {
          /* ignore */
        }
        return;
      }
      if (eventName === "column_reorder") {
        try {
          const p = JSON.parse(raw) as ColumnReorderPayload;
          applyRemoteColumnReorder(p.bucketKeys ?? [], p.fromUserId, userIdRef.current);
        } catch {
          /* ignore */
        }
        return;
      }
      if (eventName === "card_lock") {
        try {
          const p = JSON.parse(raw) as CardLockPayload;
          if (p.locked) {
            applyLockEvent(p.cardId, true, { userId: p.userId, userName: p.userName });
          } else {
            applyLockEvent(p.cardId, false);
          }
        } catch {
          /* ignore */
        }
        return;
      }
      if (eventName === "drag_start") {
        try {
          const p = JSON.parse(raw) as DragStartSsePayload;
          if (p.fromUserId === userIdRef.current) return;
          const peers = useBoardCollabStore.getState().presencePeers;
          const peer = peers.find((x) => x.userId === p.fromUserId);
          const displayName = peer?.displayName?.trim() || peer?.username?.trim() || "—";
          const ids = Array.isArray(p.cardIds) ? p.cardIds : [];
          applyRemoteDragStart(p.fromUserId, displayName, ids);
        } catch {
          /* ignore */
        }
        return;
      }
      if (eventName === "drag_move") {
        try {
          const p = JSON.parse(raw) as DragMoveSsePayload;
          if (p.fromUserId === userIdRef.current) return;
          applyRemoteDragMove(p.fromUserId, p);
        } catch {
          /* ignore */
        }
        return;
      }
      if (eventName === "drag_end") {
        try {
          const p = JSON.parse(raw) as DragEndSsePayload;
          if (p.fromUserId === userIdRef.current) return;
          applyRemoteDragEnd(p.fromUserId);
        } catch {
          /* ignore */
        }
      }
    }

    (async () => {
      try {
        const headers = {
          ...getApiHeaders(getHeaders()),
          Accept: "text/event-stream",
          ...(displayName.trim() ? { "x-flux-display-name": displayName.trim().slice(0, 120) } : {}),
        };
        const res = await fetch(url, { headers, credentials: "same-origin", signal: ac.signal });
        if (!res.ok || !res.body) {
          throw new Error("sse_failed");
        }
        setSseConnected(true);
        setPollingFallback(false);
        startBoardPollInterval(BOARD_POLL_MS_WITH_SSE);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const { events, rest } = parseSseBlocks(buf);
            buf = rest;
            for (const ev of events) {
              dispatchEvent(ev.event, ev.data);
            }
          }
        } catch {
          /* rede / abort */
        } finally {
          if (!ac.signal.aborted) {
            setSseConnected(false);
            setPollingFallback(true);
            startBoardPollInterval(BOARD_POLL_MS_FALLBACK);
          }
        }
      } catch {
        setSseConnected(false);
        setPollingFallback(true);
        setPresence([]);
        startBoardPollInterval(BOARD_POLL_MS_FALLBACK);
      }
    })();

    return () => {
      ac.abort();
      abortRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (dragMoveThrottleTimer.current) {
        clearTimeout(dragMoveThrottleTimer.current);
        dragMoveThrottleTimer.current = null;
      }
      pendingDragMoveFields.current = null;
      resetCollab();
      setSseConnected(false);
      setPollingFallback(false);
    };
  }, [
    boardId,
    displayName,
    getHeaders,
    pollBoard,
    resetCollab,
    setPollingFallback,
    setPresence,
    setSseConnected,
    setConnectionMeta,
    setLocksFromServer,
    applyLockEvent,
    applyRemoteDragStart,
    applyRemoteDragMove,
    applyRemoteDragEnd,
    userId,
  ]);

  useEffect(() => {
    if (!userId) return;
    const id = window.setInterval(() => {
      if (!connectionIdRef.current) return;
      void apiFetch(`/api/boards/${encodeURIComponent(boardId)}/presence`, {
        method: "POST",
        body: JSON.stringify({
          clientId: clientIdRef.current,
          connectionId: connectionIdRef.current,
          action: "heartbeat",
          columnKey: visibleColumnKey,
        }),
        headers: getApiHeaders(getHeaders()),
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [boardId, getHeaders, userId, visibleColumnKey]);

  const notifyBucketsChanged = useCallback(
    (bucketKeys: string[]) => {
      const conn = connectionIdRef.current;
      const uniq = [...new Set(bucketKeys)];
      const db = useBoardStore.getState().db;
      if (!uniq.length || !db) return;
      const buckets: BucketMovePayload[] = uniq.map((bucketKey) => ({
        bucketKey,
        orderedCardIds: db.cards
          .filter((c) => c.bucket === bucketKey)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((c) => c.id),
      }));
      void apiFetch(`/api/boards/${encodeURIComponent(boardId)}/presence`, {
        method: "POST",
        body: JSON.stringify({
          clientId: clientIdRef.current,
          ...(conn ? { connectionId: conn } : {}),
          action: "card_move",
          buckets,
        }),
        headers: getApiHeaders(getHeaders()),
      }).catch(() => {});
    },
    [boardId, getHeaders]
  );

  const notifyColumnReorder = useCallback(() => {
    const conn = connectionIdRef.current;
    const db = useBoardStore.getState().db;
    if (!db) return;
    const bucketKeys = db.config.bucketOrder.map((b) => b.key);
    void apiFetch(`/api/boards/${encodeURIComponent(boardId)}/presence`, {
      method: "POST",
      body: JSON.stringify({
        clientId: clientIdRef.current,
        ...(conn ? { connectionId: conn } : {}),
        action: "column_reorder",
        bucketKeys,
      }),
      headers: getApiHeaders(getHeaders()),
    }).catch(() => {});
  }, [boardId, getHeaders]);

  const notifyDragMove = useCallback(
    (fields: DragMovePostFields) => {
      pendingDragMoveFields.current = fields;
      const now = Date.now();
      const elapsed = now - lastDragMoveSentAt.current;
      const send = () => {
        const pending = pendingDragMoveFields.current;
        pendingDragMoveFields.current = null;
        if (dragMoveThrottleTimer.current) {
          clearTimeout(dragMoveThrottleTimer.current);
          dragMoveThrottleTimer.current = null;
        }
        if (!pending) return;
        lastDragMoveSentAt.current = Date.now();
        const conn = connectionIdRef.current;
        void apiFetch(`/api/boards/${encodeURIComponent(boardId)}/presence`, {
          method: "POST",
          body: JSON.stringify({
            clientId: clientIdRef.current,
            ...(conn ? { connectionId: conn } : {}),
            action: "drag_move",
            overKind: pending.overKind,
            ...(pending.bucketKey !== undefined ? { bucketKey: pending.bucketKey } : {}),
            ...(pending.slotIndex !== undefined ? { slotIndex: pending.slotIndex } : {}),
            ...(pending.overCardId !== undefined ? { overCardId: pending.overCardId } : {}),
          }),
          headers: getApiHeaders(getHeaders()),
        }).catch(() => {});
      };
      if (elapsed >= DRAG_MOVE_THROTTLE_MS) {
        send();
      } else if (!dragMoveThrottleTimer.current) {
        dragMoveThrottleTimer.current = setTimeout(send, DRAG_MOVE_THROTTLE_MS - elapsed);
      }
    },
    [boardId, getHeaders]
  );

  const notifyDragStart = useCallback(
    (cardIds: string[]) => {
      if (!cardIds.length) return;
      if (dragMoveThrottleTimer.current) {
        clearTimeout(dragMoveThrottleTimer.current);
        dragMoveThrottleTimer.current = null;
      }
      pendingDragMoveFields.current = null;
      lastDragMoveSentAt.current = 0;
      const conn = connectionIdRef.current;
      void apiFetch(`/api/boards/${encodeURIComponent(boardId)}/presence`, {
        method: "POST",
        body: JSON.stringify({
          clientId: clientIdRef.current,
          ...(conn ? { connectionId: conn } : {}),
          action: "drag_start",
          cardIds,
        }),
        headers: getApiHeaders(getHeaders()),
      }).catch(() => {});
    },
    [boardId, getHeaders]
  );

  const notifyDragEnd = useCallback(() => {
    if (dragMoveThrottleTimer.current) {
      clearTimeout(dragMoveThrottleTimer.current);
      dragMoveThrottleTimer.current = null;
    }
    const pending = pendingDragMoveFields.current;
    pendingDragMoveFields.current = null;
    const conn = connectionIdRef.current;
    const base = {
      clientId: clientIdRef.current,
      ...(conn ? { connectionId: conn } : {}),
    } as Record<string, unknown>;
    const headers = getApiHeaders(getHeaders());
    const url = `/api/boards/${encodeURIComponent(boardId)}/presence`;
    if (pending) {
      void apiFetch(url, {
        method: "POST",
        body: JSON.stringify({
          ...base,
          action: "drag_move",
          overKind: pending.overKind,
          ...(pending.bucketKey !== undefined ? { bucketKey: pending.bucketKey } : {}),
          ...(pending.slotIndex !== undefined ? { slotIndex: pending.slotIndex } : {}),
          ...(pending.overCardId !== undefined ? { overCardId: pending.overCardId } : {}),
        }),
        headers,
      })
        .catch(() => {})
        .finally(() => {
          void apiFetch(url, {
            method: "POST",
            body: JSON.stringify({ ...base, action: "drag_end" }),
            headers,
          }).catch(() => {});
        });
    } else {
      void apiFetch(url, {
        method: "POST",
        body: JSON.stringify({ ...base, action: "drag_end" }),
        headers,
      }).catch(() => {});
    }
  }, [boardId, getHeaders]);

  return {
    clientId: clientIdRef.current,
    notifyBucketsChanged,
    notifyColumnReorder,
    notifyDragStart,
    notifyDragMove,
    notifyDragEnd,
  };
}
