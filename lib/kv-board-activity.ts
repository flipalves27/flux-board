import type { Collection, Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getDb, isMongoConfigured } from "./mongo";
import type { BoardActivityAction, BoardActivityContext, BoardActivityDelta } from "./board-activity-types";
import { BOARD_ACTIVITY_ACTIONS } from "./board-activity-types";

export const COL_BOARD_ACTIVITY = "board_activity";

export type BoardActivityDoc = {
  _id: ObjectId;
  boardId: string;
  orgId: string;
  userId: string;
  userName: string;
  action: BoardActivityAction;
  target: string;
  details: Record<string, unknown> | null;
  timestamp: Date;
  /** Present on Free-tier inserts — TTL purge. */
  expiresAt?: Date;
};

let indexesEnsured = false;

async function ensureBoardActivityIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  const col = db.collection<BoardActivityDoc>(COL_BOARD_ACTIVITY);
  await col.createIndex({ boardId: 1, orgId: 1, timestamp: -1 });
  await col.createIndex({ boardId: 1, orgId: 1, userId: 1, timestamp: -1 });
  await col.createIndex({ boardId: 1, orgId: 1, action: 1, timestamp: -1 });
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  indexesEnsured = true;
}

export async function insertBoardActivities(
  deltas: BoardActivityDelta[],
  ctx: BoardActivityContext & { boardId: string },
  expiresAt?: Date
): Promise<void> {
  if (!isMongoConfigured() || !deltas.length) return;
  const db = await getDb();
  await ensureBoardActivityIndexes(db);
  const col: Collection<BoardActivityDoc> = db.collection(COL_BOARD_ACTIVITY);
  const now = new Date();
  const docs: BoardActivityDoc[] = deltas.map((d) => {
    const base: Omit<BoardActivityDoc, "_id"> = {
      boardId: ctx.boardId,
      orgId: ctx.orgId,
      userId: ctx.userId,
      userName: ctx.userName.slice(0, 200),
      action: d.action,
      target: d.target.slice(0, 400),
      details: d.details,
      timestamp: now,
      ...(expiresAt ? { expiresAt } : {}),
    };
    return { _id: new ObjectId(), ...base };
  });
  await col.insertMany(docs, { ordered: false });
}

export type ListBoardActivityParams = {
  boardId: string;
  orgId: string;
  userId?: string;
  action?: BoardActivityAction;
  from?: Date;
  to?: Date;
  limit: number;
  minTimestamp?: Date;
};

export type BoardActivityListItem = {
  id: string;
  boardId: string;
  orgId: string;
  userId: string;
  userName: string;
  action: BoardActivityAction;
  target: string;
  details: Record<string, unknown> | null;
  timestamp: string;
};

export function parseBoardActivityAction(raw: string | null): BoardActivityAction | undefined {
  if (!raw) return undefined;
  return (BOARD_ACTIVITY_ACTIONS as readonly string[]).includes(raw) ? (raw as BoardActivityAction) : undefined;
}

export async function listBoardActivity(params: ListBoardActivityParams): Promise<BoardActivityListItem[]> {
  if (!isMongoConfigured()) return [];
  const db = await getDb();
  await ensureBoardActivityIndexes(db);
  const col = db.collection<BoardActivityDoc>(COL_BOARD_ACTIVITY);

  const q: Record<string, unknown> = {
    boardId: params.boardId,
    orgId: params.orgId,
  };
  if (params.userId) q.userId = params.userId;
  if (params.action) q.action = params.action;

  const range: { $gte?: Date; $lte?: Date } = {};
  let low = params.minTimestamp;
  if (params.from) {
    low = low ? (params.from > low ? params.from : low) : params.from;
  }
  if (low) range.$gte = low;
  if (params.to) range.$lte = params.to;
  if (range.$gte !== undefined || range.$lte !== undefined) {
    q.timestamp = range;
  }

  const cur = col
    .find(q)
    .sort({ timestamp: -1 })
    .limit(Math.min(Math.max(params.limit, 1), 1000))
    .project({
      boardId: 1,
      orgId: 1,
      userId: 1,
      userName: 1,
      action: 1,
      target: 1,
      details: 1,
      timestamp: 1,
    });

  const rows = await cur.toArray();
  return rows.map((r) => ({
    id: String(r._id),
    boardId: r.boardId,
    orgId: r.orgId,
    userId: r.userId,
    userName: r.userName,
    action: r.action,
    target: r.target,
    details: r.details ?? null,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : new Date(r.timestamp as string).toISOString(),
  }));
}
