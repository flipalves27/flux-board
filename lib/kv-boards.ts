import { getStore } from "./storage";
import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";

const BOARDS_PREFIX = "reborn_boards:";
const BOARD_PREFIX = "reborn_board:";
const BOARD_COUNTER = "reborn_board_counter";

const COL_BOARDS = "boards";
const COL_USER_BOARDS = "user_boards";
const COL_COUNTERS = "counters";

export const BOARD_REBORN_ID = "b_reborn";

export interface BoardData {
  id: string;
  ownerId: string;
  name: string;
  version?: string;
  cards?: unknown[];
  config?: { bucketOrder: unknown[]; collapsedColumns?: string[] };
  mapaProducao?: unknown[];
  dailyInsights?: unknown[];
  createdAt?: string;
  lastUpdated?: string;
}

type BoardDoc = Omit<BoardData, "id"> & { _id: string };

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

async function ensureBoardIndexes(db: Db): Promise<void> {
  if (boardIndexesEnsured) return;
  await db.collection<BoardDoc>(COL_BOARDS).createIndex({ ownerId: 1 });
  await db.collection(COL_USER_BOARDS).createIndex({ _id: 1 });
  boardIndexesEnsured = true;
}

export async function getBoardIds(userId: string, isAdmin: boolean): Promise<string[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    const ids = new Set<string>();
    if (isAdmin) {
      const { listUsers } = await import("./kv-users");
      const users = await listUsers();
      const ub = db.collection<{ _id: string; boardIds: string[] }>(COL_USER_BOARDS);
      for (const u of users) {
        const row = await ub.findOne({ _id: u.id });
        (row?.boardIds ?? []).forEach((bid) => ids.add(bid));
      }
      const boardReborn = await db.collection<BoardDoc>(COL_BOARDS).findOne({ _id: BOARD_REBORN_ID });
      if (boardReborn) ids.add(BOARD_REBORN_ID);
    } else {
      const row = await db
        .collection<{ _id: string; boardIds: string[] }>(COL_USER_BOARDS)
        .findOne({ _id: userId });
      (row?.boardIds ?? []).forEach((bid) => ids.add(bid));
    }
    return [...ids];
  }

  const kv = await getStore();
  const ids = new Set<string>();
  if (isAdmin) {
    const { listUsers } = await import("./kv-users");
    const users = await listUsers();
    for (const u of users) {
      const userIds = ((await kv.get<string[]>(userBoardsKey(u.id))) as string[]) || [];
      userIds.forEach((id) => ids.add(id));
    }
    const boardReborn = await getBoard(BOARD_REBORN_ID);
    if (boardReborn) ids.add(BOARD_REBORN_ID);
  } else {
    const userIds = ((await kv.get<string[]>(userBoardsKey(userId))) as string[]) || [];
    userIds.forEach((id) => ids.add(id));
  }
  return [...ids];
}

export async function getBoard(boardId: string): Promise<BoardData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    const doc = await db.collection<BoardDoc>(COL_BOARDS).findOne({ _id: boardId });
    return doc ? boardDocToData(doc) : null;
  }
  const kv = await getStore();
  const raw = await kv.get<string>(BOARD_PREFIX + boardId);
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as BoardData;
}

export async function createBoard(
  userId: string,
  name: string,
  data: Partial<BoardData>
): Promise<BoardData> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    const counter = await nextBoardCounterMongo(db);
    const boardId = "b_" + counter;
    const board: BoardData = {
      id: boardId,
      ownerId: userId,
      name: name || "Novo Board",
      ...data,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    await db.collection<BoardDoc>(COL_BOARDS).insertOne(boardDataToDoc(board));
    await db.collection<{ _id: string; boardIds: string[] }>(COL_USER_BOARDS).updateOne(
      { _id: userId },
      { $push: { boardIds: boardId } },
      { upsert: true }
    );
    return board;
  }

  const kv = await getStore();
  const counter = (((await kv.get<number>(BOARD_COUNTER)) as number) || 0) + 1;
  await kv.set(BOARD_COUNTER, counter);
  const boardId = "b_" + counter;
  const board: BoardData = {
    id: boardId,
    ownerId: userId,
    name: name || "Novo Board",
    ...data,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
  await kv.set(BOARD_PREFIX + boardId, JSON.stringify(board));
  const ids = ((await kv.get<string[]>(userBoardsKey(userId))) as string[]) || [];
  ids.push(boardId);
  await kv.set(userBoardsKey(userId), ids);
  return board;
}

export async function updateBoard(boardId: string, updates: Partial<BoardData>): Promise<BoardData | null> {
  const board = await getBoard(boardId);
  if (!board) return null;
  Object.assign(board, updates);
  board.lastUpdated = new Date().toISOString();

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    await db.collection<BoardDoc>(COL_BOARDS).replaceOne({ _id: boardId }, boardDataToDoc(board));
    return board;
  }

  const kv = await getStore();
  await kv.set(BOARD_PREFIX + boardId, JSON.stringify(board));
  return board;
}

export async function deleteBoard(boardId: string, userId: string, isAdmin: boolean): Promise<boolean> {
  if (boardId === BOARD_REBORN_ID && !isAdmin) return false;
  const board = await getBoard(boardId);
  if (!board) return false;
  if (board.ownerId !== userId && !isAdmin) return false;

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    await db.collection<BoardDoc>(COL_BOARDS).deleteOne({ _id: boardId });
    await db.collection<{ _id: string; boardIds: string[] }>(COL_USER_BOARDS).updateOne(
      { _id: board.ownerId },
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

export async function userCanAccessBoard(userId: string, isAdmin: boolean, boardId: string): Promise<boolean> {
  const board = await getBoard(boardId);
  if (!board) return false;
  if (board.ownerId === userId || isAdmin) return true;
  return false;
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
  const jsPath = path.join(dataDir, "db.js");
  const seedPath = fs.existsSync(jsonPath) ? jsonPath : jsPath;
  const raw = fs.readFileSync(seedPath, "utf-8");
  const seed = JSON.parse(raw);
  return {
    version: "2.0",
    cards: seed.cards || [],
    config: seed.config || { bucketOrder: [], collapsedColumns: [] },
    mapaProducao: seed.mapaProducao || [],
    dailyInsights: [],
  };
}

export async function ensureBoardReborn(
  adminId: string,
  getSeedData: () => ReturnType<typeof getDefaultBoardData>
): Promise<BoardData> {
  const existing = await getBoard(BOARD_REBORN_ID);
  if (existing) return existing;

  const seedData = getSeedData();
  const board: BoardData = {
    id: BOARD_REBORN_ID,
    ownerId: adminId,
    name: "Board-Reborn",
    version: seedData.version || "2.0",
    cards: seedData.cards || [],
    config: seedData.config as BoardData["config"],
    mapaProducao: seedData.mapaProducao || [],
    dailyInsights: seedData.dailyInsights || [],
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureBoardIndexes(db);
    await db.collection<BoardDoc>(COL_BOARDS).insertOne(boardDataToDoc(board));
    await db.collection<{ _id: string; boardIds: string[] }>(COL_USER_BOARDS).updateOne(
      { _id: adminId },
      { $addToSet: { boardIds: BOARD_REBORN_ID } },
      { upsert: true }
    );
    return board;
  }

  const kv = await getStore();
  await kv.set(BOARD_PREFIX + BOARD_REBORN_ID, JSON.stringify(board));
  const ids = ((await kv.get<string[]>(userBoardsKey(adminId))) as string[]) || [];
  if (!ids.includes(BOARD_REBORN_ID)) {
    ids.push(BOARD_REBORN_ID);
    await kv.set(userBoardsKey(adminId), ids);
  }
  return board;
}
