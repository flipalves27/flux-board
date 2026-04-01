import type { BucketMovePayload, CardLockPayload } from "./board-realtime-hub";

export const BOARD_REALTIME_CHANNEL_PREFIX = "flux:board:";

export type BoardRealtimeEventType =
  | "card_move"
  | "column_reorder"
  | "card_lock"
  | "drag_start"
  | "drag_move"
  | "drag_end";

export type DragOverKind = "bucket" | "slot" | "card";

export type DragStartSsePayload = {
  fromUserId: string;
  fromConnectionId?: string;
  cardIds: string[];
};

export type DragMoveSsePayload = {
  fromUserId: string;
  overKind: DragOverKind;
  bucketKey?: string;
  slotIndex?: number;
  overCardId?: string;
};

export type DragEndSsePayload = {
  fromUserId: string;
};

export type BoardRealtimeEnvelopeV1 = {
  v: 1;
  type: BoardRealtimeEventType;
  boardId: string;
  excludeConnectionId?: string;
  payload:
    | { fromUserId: string; buckets: BucketMovePayload[] }
    | { fromUserId: string; bucketKeys: string[] }
    | CardLockPayload
    | DragStartSsePayload
    | DragMoveSsePayload
    | DragEndSsePayload;
};

export function boardRedisChannel(boardId: string): string {
  return `${BOARD_REALTIME_CHANNEL_PREFIX}${boardId}`;
}

export function parseBoardRealtimeEnvelope(raw: string): BoardRealtimeEnvelopeV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.boardId !== "string" || !o.boardId) return null;
  if (typeof o.type !== "string") return null;
  const allowed: BoardRealtimeEventType[] = [
    "card_move",
    "column_reorder",
    "card_lock",
    "drag_start",
    "drag_move",
    "drag_end",
  ];
  if (!allowed.includes(o.type as BoardRealtimeEventType)) return null;
  if (!("payload" in o)) return null;
  const env: BoardRealtimeEnvelopeV1 = {
    v: 1,
    type: o.type as BoardRealtimeEventType,
    boardId: o.boardId,
    payload: o.payload as BoardRealtimeEnvelopeV1["payload"],
  };
  if (typeof o.excludeConnectionId === "string" && o.excludeConnectionId) {
    env.excludeConnectionId = o.excludeConnectionId;
  }
  return env;
}
