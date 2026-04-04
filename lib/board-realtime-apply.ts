import type { BoardRealtimeEnvelopeV1 } from "./board-realtime-envelope";
import {
  applyCardLockFromEvent,
  deliverSseToBoard,
  type CardLockPayload,
  type CardMoveEventPayload,
  type ColumnReorderPayload,
} from "./board-realtime-hub";

/**
 * Aplica um envelope no hub local (SSE + estado de locks). Usado sem Redis e pelo subscritor Redis.
 */
export function applyBoardRealtimeEnvelope(env: BoardRealtimeEnvelopeV1): void {
  const ex = env.excludeConnectionId;

  switch (env.type) {
    case "card_move": {
      const p = env.payload as { fromUserId: string; buckets: CardMoveEventPayload["buckets"] };
      const data: CardMoveEventPayload = {
        ...p,
        ...(ex ? { fromConnectionId: ex } : {}),
      };
      deliverSseToBoard(env.boardId, "card_move", data, ex);
      break;
    }
    case "column_reorder": {
      const p = env.payload as { fromUserId: string; bucketKeys: string[] };
      const data: ColumnReorderPayload = {
        ...p,
        ...(ex ? { fromConnectionId: ex } : {}),
      };
      deliverSseToBoard(env.boardId, "column_reorder", data, ex);
      break;
    }
    case "card_lock":
      applyCardLockFromEvent(env.boardId, env.payload as CardLockPayload);
      break;
    case "drag_start":
    case "drag_move":
    case "drag_end":
      deliverSseToBoard(env.boardId, env.type, env.payload, ex);
      break;
  }
}
