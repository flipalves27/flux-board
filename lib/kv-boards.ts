import { getStore } from "./storage";
import { getDb, isMongoConfigured } from "./mongo";
import { ensureTenancyMigrationForExistingData } from "./kv-organizations";
import type { BoardPortalSettings } from "./portal-types";
import type { BoardAnomalyNotifications } from "./anomaly-board-settings";
import type { Db } from "mongodb";
import type { BoardActivityContext } from "./board-activity-types";
import { diffBoardActivity } from "./board-activity-diff";
import { scheduleBoardActivityWrites } from "./board-activity-log";
import { scheduleWebhookBoardPersist } from "./webhook-emit";

const BOARDS_PREFIX = "flux_boards:";
const BOARD_PREFIX = "flux_board:";
const BOARD_COUNTER = "flux_board_counter";

const COL_BOARDS = "boards";
const COL_USER_BOARDS = "user_boards";
const COL_COUNTERS = "counters";

export interface BoardData {
  id: string;
  ownerId: string;
  orgId: string;
  name: string;
  /** Rótulo comercial opcional (cliente, conta, linha de negócio) — útil para consultorias e B2B. */
  clientLabel?: string;
  version?: string;
  cards?: unknown[];
  config?: { bucketOrder: unknown[]; collapsedColumns?: string[]; labels?: string[] };
  intakeForm?: unknown;
  mapaProducao?: unknown[];
  dailyInsights?: unknown[];
  /** Estado para gatilhos por tempo (ex.: % de conclusão) — atualizado pelo cron de automações. */
  automationBoardState?: { lastCompletionPercent?: number };
  /** Portal público somente leitura (token opaco + filtros + branding). */
  portal?: BoardPortalSettings;
  /** Alertas de anomalia (e-mail + contexto): tipos, severidade mínima, destinatários extras. */
  anomalyNotifications?: BoardAnomalyNotifications;
  createdAt?: string;
  lastUpdated?: string;
}

type BoardDoc = Omit<BoardData, "id"> & { _id: string };

function sanitizeBoardLabelsRelation(board: BoardData): BoardData {
  const configRaw = board.config as BoardData["config"] | undefined;
  const config: NonNullable<BoardData["config"]> = {
    bucketOrder: Array.isArray(configRaw?.bucketOrder) ? configRaw.bucketOrder : [],
    ...(Array.isArray(configRaw?.collapsedColumns) ? { collapsedColumns: configRaw.collapsedColumns } : {}),
    ...(Array.isArray(configRaw?.labels) ? { labels: configRaw.labels } : {}),
  };
  const labelsRaw = Array.isArray(config.labels) ? config.labels : [];
  const labels = [...new Set(labelsRaw.map((l: unknown) => String(l).trim()).filter(Boolean))];
  const labelSet = new Set(labels);
  const cards = Array.isArray(board.cards)
    ? board.cards.map((card) => {
        if (!card || typeof card !== "object") return card;
        const cardObj = card as { tags?: unknown };
        if (!Array.isArray(cardObj.tags)) return card;
        return {
          ...(card as Record<string, unknown>),
          tags: cardObj.tags
            .map((tag) => String(tag).trim())
            .filter((tag) => labelSet.has(tag)),
        };
      })
    : board.cards;
  return {
    ...board,
    cards,
    config: {
      ...config,
      labels,
    },
  };
}

function userBoardsKey(userId: string) {
  return BOARDS_PREFIX + userId;
}

function boardDocToData(doc: BoardDoc): BoardData {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id };
}

function boardDataToDoc(board: BoardData): BoardDoc {
  const { id, ...rest } = board;
  return { _id: id, ...rest };
}

async function nextBoardCounterMongo(db: Db): Promise<number> {
  const r = await db.collection<{ _id: string; seq: number }>(COL_COUNTERS).findOneAndUpdate(
    { _id: "board" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  const seq = r?.seq;
  if (typeof seq !== "number") throw new Error("board counter failed");
  return seq;
}

let boardIndexesEnsured = false;
let tenancyMigrationEnsured = false;
async function ensureTenancyMigrationOnce(): Promise<void> {
  if (tenancyMigrationEnsured) return;
  await ensureTenancyMigrationForExistingData("admin");
  tenancyMigrationEnsured = true;
}

async function ensureBoardIndexes(db: Db): Promise<void> {
  if (boardIndexesEnsured) return;
  await ensureTenancyMigrationOnce();
  await db.collection<BoardDoc>(COL_BOARDS).createIndex({ orgId: 1, ownerId: 1 });
  await db.collection<BoardDoc>(COL_BOARDS).createIndex({ orgId: 1 });
  await db.collection(COL_USER_BOARDS).createIndex({ _id: 1, orgId: 1 });
  boardIndexesEnsured = true;
}

export async function getBoardIds(userId: string, orgId: string, isAdmin: boolean): Promise<string[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    const ids = new Set<string>();
    if (isAdmin) {
      const { listUsers } = await import("./kv-users");
      const users = await listUsers(orgId);
      const ub = db.collection<{ _id: string; orgId: string; boardIds: string[] }>(COL_USER_BOARDS);
      const userIds = users.map((u) => u.id);
      if (userIds.length) {
        const rows = await ub.find({ _id: { $in: userIds }, orgId }).toArray();
        for (const row of rows) {
          (row?.boardIds ?? []).forEach((bid) => ids.add(bid));
        }
      }
    } else {
      const row = await db.collection<{ _id: string; orgId: string; boardIds: string[] }>(COL_USER_BOARDS).findOne({
        _id: userId,
        orgId,
      });
      (row?.boardIds ?? []).forEach((bid) => ids.add(bid));
    }
    return [...ids];
  }

  const kv = await getStore();
  const ids = new Set<string>();
  if (isAdmin) {
    const { listUsers } = await import("./kv-users");
    const users = await listUsers(orgId);
    const boardsPerUser = await Promise.all(
      users.map(async (u) => ((await kv.get<string[]>(userBoardsKey(u.id))) as string[]) || [])
    );
    for (const userIds of boardsPerUser) {
      userIds.forEach((id) => ids.add(id));
    }
  } else {
    const userIds = ((await kv.get<string[]>(userBoardsKey(userId))) as string[]) || [];
    userIds.forEach((id) => ids.add(id));
  }
  return [...ids];
}

export async function listBoardsForUser(userId: string, orgId: string, isAdmin: boolean): Promise<BoardData[]> {
  const boardIds = await getBoardIds(userId, orgId, isAdmin);
  return getBoardsByIds(boardIds, orgId);
}

export async function getBoardsByIds(boardIds: string[], orgId: string): Promise<BoardData[]> {
  if (!boardIds.length) return [];

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    const docs = await db
      .collection<BoardDoc>(COL_BOARDS)
      .find({ _id: { $in: boardIds }, orgId })
      .toArray();
    const byId = new Map<string, BoardData>();
    for (const doc of docs) {
      byId.set(doc._id, boardDocToData(doc));
    }
    return boardIds.map((id) => byId.get(id)).filter((b): b is BoardData => Boolean(b));
  }

  const kv = await getStore();
  const results = await Promise.all(
    boardIds.map(async (id) => {
      const raw = await kv.get<string>(BOARD_PREFIX + id);
      if (!raw) return null;
      const board = (typeof raw === "string" ? JSON.parse(raw) : raw) as BoardData;
      return board?.orgId === orgId ? board : null;
    })
  );
  return results.filter((b): b is BoardData => Boolean(b));
}

export async function getBoard(boardId: string, orgId: string): Promise<BoardData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    const doc = await db.collection<BoardDoc>(COL_BOARDS).findOne({ _id: boardId, orgId });
    return doc ? boardDocToData(doc) : null;
  }
  const kv = await getStore();
  const raw = await kv.get<string>(BOARD_PREFIX + boardId);
  if (!raw) return null;
  const board = (typeof raw === "string" ? JSON.parse(raw) : raw) as BoardData;
  return board?.orgId === orgId ? board : null;
}

export async function createBoard(
  orgId: string,
  userId: string,
  name: string,
  data: Partial<BoardData>
): Promise<BoardData> {
  const dataConfig = data.config as BoardData["config"] | undefined;
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    const counter = await nextBoardCounterMongo(db);
    const boardId = "b_" + counter;
    const board = sanitizeBoardLabelsRelation({
      id: boardId,
      ownerId: userId,
      orgId,
      name: name || "Novo Board",
      ...data,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      config: {
        ...(dataConfig ?? { bucketOrder: [] }),
        bucketOrder: Array.isArray(dataConfig?.bucketOrder) ? dataConfig.bucketOrder : [],
        labels: [],
      },
    });
    await db.collection<BoardDoc>(COL_BOARDS).insertOne(boardDataToDoc(board));
    await db
      .collection<{ _id: string; orgId: string; boardIds: string[] }>(COL_USER_BOARDS)
      .updateOne({ _id: userId, orgId }, { $addToSet: { boardIds: boardId } }, { upsert: true });
    return board;
  }

  const kv = await getStore();
  const counter = (((await kv.get<number>(BOARD_COUNTER)) as number) || 0) + 1;
  await kv.set(BOARD_COUNTER, counter);
  const boardId = "b_" + counter;
  const board = sanitizeBoardLabelsRelation({
    id: boardId,
    ownerId: userId,
    orgId,
    name: name || "Novo Board",
    ...data,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    config: {
      ...(dataConfig ?? { bucketOrder: [] }),
      bucketOrder: Array.isArray(dataConfig?.bucketOrder) ? dataConfig.bucketOrder : [],
      labels: [],
    },
  });
  await kv.set(BOARD_PREFIX + boardId, JSON.stringify(board));
  const ids = ((await kv.get<string[]>(userBoardsKey(userId))) as string[]) || [];
  ids.push(boardId);
  await kv.set(userBoardsKey(userId), ids);
  return board;
}

export async function updateBoard(
  boardId: string,
  orgId: string,
  updates: Partial<BoardData>,
  activity?: BoardActivityContext
): Promise<BoardData | null> {
  const board = await getBoard(boardId, orgId);
  if (!board) return null;
  return updateBoardFromExisting(board, updates, activity);
}

export async function updateBoardFromExisting(
  board: BoardData,
  updates: Partial<BoardData>,
  activity?: BoardActivityContext
): Promise<BoardData> {
  const nextBoard: BoardData = sanitizeBoardLabelsRelation({ ...board, ...updates });

  // Se o clientLabel vier vazio, remove o campo para não “fixar” string vazia no layout.
  if ("clientLabel" in updates) {
    const v = updates.clientLabel;
    if (!v || v.trim() === "") {
      delete (nextBoard as BoardData).clientLabel;
    }
  }

  if ("anomalyNotifications" in updates && updates.anomalyNotifications === undefined) {
    delete (nextBoard as BoardData).anomalyNotifications;
  }

  nextBoard.lastUpdated = new Date().toISOString();

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    await db
      .collection<BoardDoc>(COL_BOARDS)
      .replaceOne({ _id: nextBoard.id, orgId: nextBoard.orgId }, boardDataToDoc(nextBoard));
    scheduleBoardActivityAfterPersist(board, nextBoard, activity);
    scheduleWebhookBoardPersist(board, nextBoard);
    return nextBoard;
  }

  const kv = await getStore();
  await kv.set(BOARD_PREFIX + nextBoard.id, JSON.stringify(nextBoard));
  scheduleBoardActivityAfterPersist(board, nextBoard, activity);
  scheduleWebhookBoardPersist(board, nextBoard);
  return nextBoard;
}

function scheduleBoardActivityAfterPersist(
  prev: BoardData,
  next: BoardData,
  activity: BoardActivityContext | undefined
): void {
  if (!activity || !isMongoConfigured()) return;
  try {
    const deltas = diffBoardActivity(prev, next);
    if (deltas.length) {
      scheduleBoardActivityWrites(deltas, {
        userId: activity.userId,
        userName: activity.userName,
        orgId: activity.orgId,
        boardId: next.id,
      });
    }
  } catch (e) {
    console.error("[board-activity] diff", e);
  }
}

export async function deleteBoard(boardId: string, orgId: string, userId: string, isAdmin: boolean): Promise<boolean> {
  const board = await getBoard(boardId, orgId);
  if (!board) return false;
  if (board.ownerId !== userId && !isAdmin) return false;

  if (board.portal?.token) {
    const { deletePortalIndex } = await import("./kv-portal");
    await deletePortalIndex(board.portal.token);
  }

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    await db.collection<BoardDoc>(COL_BOARDS).deleteOne({ _id: boardId, orgId });
    await db.collection<{ _id: string; orgId: string; boardIds: string[] }>(COL_USER_BOARDS).updateOne(
      { _id: board.ownerId, orgId },
      { $pull: { boardIds: boardId } }
    );
    return true;
  }

  const kv = await getStore();
  await kv.del(BOARD_PREFIX + boardId);
  const ids = ((await kv.get<string[]>(userBoardsKey(board.ownerId))) as string[]) || [];
  const filtered = ids.filter((id) => id !== boardId);
  await kv.set(userBoardsKey(board.ownerId), filtered);
  return true;
}

export async function userCanAccessBoard(userId: string, orgId: string, isAdmin: boolean, boardId: string): Promise<boolean> {
  const board = await getBoard(boardId, orgId);
  if (!board) return false;
  if (board.ownerId === userId || isAdmin) return true;
  // Board-level RBAC: check membership
  const { getBoardEffectiveRole, roleCanRead } = await import("./kv-board-members");
  const role = await getBoardEffectiveRole(orgId, boardId, userId, false, false);
  return roleCanRead(role);
}

export function getDefaultBoardData(): {
  version: string;
  cards: unknown[];
  config: unknown;
  mapaProducao: unknown[];
  dailyInsights: unknown[];
} {
  const fs = require("fs");
  const path = require("path");
  const dataDir = path.join(process.cwd(), "data");
  const jsonPath = path.join(dataDir, "db.json");
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const seed = JSON.parse(raw);
  return {
    version: "2.0",
    cards: seed.cards || [],
    config: seed.config || { bucketOrder: [], collapsedColumns: [] },
    mapaProducao: seed.mapaProducao || [],
    dailyInsights: [],
  };
}
