import { diffBoardActivity } from "./board-activity-diff";
import type { BoardSnapshotForActivity } from "./board-activity-types";
import type { WebhookEventType } from "./webhook-types";

const COMPLETED_PROGRESS = "Concluída";

function cardAsRecord(c: unknown): Record<string, unknown> | null {
  if (!c || typeof c !== "object") return null;
  return c as Record<string, unknown>;
}

function buildCardMap(cards: unknown[] | undefined): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(cards)) return m;
  for (const raw of cards) {
    const c = cardAsRecord(raw);
    const id = c ? String(c.id || "").trim() : "";
    if (!id || !c) continue;
    m.set(id, c);
  }
  return m;
}

export type WebhookBoardEmit = {
  type: WebhookEventType;
  data: Record<string, unknown>;
};

/**
 * Deriva eventos de webhook a partir de dois snapshots de board (pós-persistência).
 */
export function deriveWebhookBoardEvents(
  prev: BoardSnapshotForActivity,
  next: BoardSnapshotForActivity
): WebhookBoardEmit[] {
  const boardId = String(next.id || "");
  const boardName = String(next.name || "");
  const deltas = diffBoardActivity(prev, next);
  const out: WebhookBoardEmit[] = [];

  const boardLevelChanges: string[] = [];
  const boardDetails: Record<string, unknown>[] = [];

  for (const d of deltas) {
    if (d.action === "card.created") {
      const det = (d.details || {}) as Record<string, unknown>;
      out.push({
        type: "card.created",
        data: {
          board_id: boardId,
          board_name: boardName,
          card_id: String(det.cardId || ""),
          bucket: String(det.bucket || ""),
          title: d.target,
        },
      });
      continue;
    }
    if (d.action === "card.deleted") {
      const det = (d.details || {}) as Record<string, unknown>;
      out.push({
        type: "card.deleted",
        data: {
          board_id: boardId,
          board_name: boardName,
          card_id: String(det.cardId || ""),
          bucket: String(det.bucket || ""),
          title: d.target,
        },
      });
      continue;
    }
    if (d.action === "card.moved") {
      const det = (d.details || {}) as Record<string, unknown>;
      out.push({
        type: "card.moved",
        data: {
          board_id: boardId,
          board_name: boardName,
          card_id: String(det.cardId || ""),
          from_bucket: String(det.fromBucket || ""),
          to_bucket: String(det.toBucket || ""),
          from_label: String(det.fromLabel || ""),
          to_label: String(det.toLabel || ""),
          title: d.target,
        },
      });
      continue;
    }
    if (d.action === "board.settings_changed" || d.action === "column.added" || d.action === "column.removed") {
      boardLevelChanges.push(d.action);
      boardDetails.push({
        action: d.action,
        target: d.target,
        details: d.details,
      });
    }
  }

  const prevCards = buildCardMap(prev.cards as unknown[] | undefined);
  const nextCards = buildCardMap(next.cards as unknown[] | undefined);
  for (const [id, nc] of nextCards) {
    const pc = prevCards.get(id);
    if (!pc) continue;
    const was = String(pc.progress || "");
    const now = String(nc.progress || "");
    if (was !== COMPLETED_PROGRESS && now === COMPLETED_PROGRESS) {
      out.push({
        type: "card.completed",
        data: {
          board_id: boardId,
          board_name: boardName,
          card_id: id,
          bucket: String(nc.bucket || ""),
          title: String(nc.title || id),
        },
      });
    }
  }

  if (boardLevelChanges.length) {
    out.push({
      type: "board.updated",
      data: {
        board_id: boardId,
        board_name: boardName,
        source_actions: boardLevelChanges,
        deltas: boardDetails,
      },
    });
  }

  return out;
}
