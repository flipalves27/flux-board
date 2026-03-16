import { getStore } from "./storage";

const BOARDS_PREFIX = "reborn_boards:";
const BOARD_PREFIX = "reborn_board:";
const BOARD_COUNTER = "reborn_board_counter";
export const BOARD_REBORN_ID = "b_reborn";

function userBoardsKey(userId: string) {
  return BOARDS_PREFIX + userId;
}

export async function getBoardIds(userId: string, isAdmin: boolean): Promise<string[]> {
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

export interface BoardData {
  id: string;
  ownerId: string;
  name: string;
  version?: string;
  cards?: unknown[];
  config?: { bucketOrder: unknown[]; collapsedColumns?: string[] };
  mapaProducao?: unknown[];
  createdAt?: string;
  lastUpdated?: string;
}

export async function getBoard(boardId: string): Promise<BoardData | null> {
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
  const kv = await getStore();
  await kv.set(BOARD_PREFIX + boardId, JSON.stringify(board));
  return board;
}

export async function deleteBoard(boardId: string, userId: string, isAdmin: boolean): Promise<boolean> {
  if (boardId === BOARD_REBORN_ID && !isAdmin) return false;
  const board = await getBoard(boardId);
  if (!board) return false;
  if (board.ownerId !== userId && !isAdmin) return false;
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

export function getDefaultBoardData(): { version: string; cards: unknown[]; config: unknown; mapaProducao: unknown[] } {
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
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
  const kv = await getStore();
  await kv.set(BOARD_PREFIX + BOARD_REBORN_ID, JSON.stringify(board));
  const ids = ((await kv.get<string[]>(userBoardsKey(adminId))) as string[]) || [];
  if (!ids.includes(BOARD_REBORN_ID)) {
    ids.push(BOARD_REBORN_ID);
    await kv.set(userBoardsKey(adminId), ids);
  }
  return board;
}
