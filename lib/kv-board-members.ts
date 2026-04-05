/**
 * Board-level RBAC: viewer | editor | admin roles.
 * Membership is optional (open boards = any org member can view).
 * If no members are defined for a board, it falls back to owner-only access (existing behaviour).
 */
import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { getStore } from "./storage";

export type BoardRole = "viewer" | "editor" | "admin";

export function isBoardRole(s: string): s is BoardRole {
  return s === "viewer" || s === "editor" || s === "admin";
}

export type BoardMember = {
  boardId: string;
  orgId: string;
  userId: string;
  username: string;
  role: BoardRole;
  invitedBy: string;
  addedAt: string;
};

const COL_BOARD_MEMBERS = "board_members";

function kvKeyBoardMembers(orgId: string, boardId: string): string {
  return `board_members:${orgId}:${boardId}`;
}

let indexEnsured = false;
async function ensureIndexes(db: Db): Promise<void> {
  if (indexEnsured) return;
  await db.collection(COL_BOARD_MEMBERS).createIndex({ orgId: 1, boardId: 1 });
  await db.collection(COL_BOARD_MEMBERS).createIndex({ orgId: 1, userId: 1 });
  await db.collection(COL_BOARD_MEMBERS).createIndex({ orgId: 1, boardId: 1, userId: 1 }, { unique: true });
  indexEnsured = true;
}

export async function listBoardMembers(orgId: string, boardId: string): Promise<BoardMember[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    return db.collection<BoardMember>(COL_BOARD_MEMBERS).find({ orgId, boardId } as any).toArray() as Promise<BoardMember[]>;
  }
  const store = await getStore();
  return (await store.get<BoardMember[]>(kvKeyBoardMembers(orgId, boardId))) ?? [];
}

export async function getBoardMember(orgId: string, boardId: string, userId: string): Promise<BoardMember | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const doc = await db.collection<BoardMember>(COL_BOARD_MEMBERS).findOne({ orgId, boardId, userId } as any);
    return doc as BoardMember | null;
  }
  const members = await listBoardMembers(orgId, boardId);
  return members.find((m) => m.userId === userId) ?? null;
}

export async function upsertBoardMember(member: BoardMember): Promise<BoardMember> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection<BoardMember>(COL_BOARD_MEMBERS).updateOne(
      { orgId: member.orgId, boardId: member.boardId, userId: member.userId } as any,
      { $set: member },
      { upsert: true }
    );
    return member;
  }
  const store = await getStore();
  const key = kvKeyBoardMembers(member.orgId, member.boardId);
  const members = (await store.get<BoardMember[]>(key)) ?? [];
  const idx = members.findIndex((m) => m.userId === member.userId);
  if (idx >= 0) members[idx] = member; else members.push(member);
  await store.set(key, members);
  return member;
}

export async function removeBoardMember(orgId: string, boardId: string, userId: string): Promise<boolean> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const result = await db.collection(COL_BOARD_MEMBERS).deleteOne({ orgId, boardId, userId } as any);
    return result.deletedCount > 0;
  }
  const store = await getStore();
  const key = kvKeyBoardMembers(orgId, boardId);
  const members = (await store.get<BoardMember[]>(key)) ?? [];
  const filtered = members.filter((m) => m.userId !== userId);
  if (filtered.length === members.length) return false;
  await store.set(key, filtered);
  return true;
}

/**
 * Checks if a user has at least the given role on a board.
 * Returns null if there are no board-level members (open access).
 */
export async function getBoardEffectiveRole(
  orgId: string,
  boardId: string,
  userId: string,
  isOwner: boolean,
  isOrgAdmin: boolean
): Promise<BoardRole | "none" | "open"> {
  if (isOrgAdmin || isOwner) return "admin";
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const col = db.collection<BoardMember>(COL_BOARD_MEMBERS);
    const member = await col.findOne({ orgId, boardId, userId } as never);
    if (member) return member.role as BoardRole;
    const anyMember = await col.findOne({ orgId, boardId } as never, { projection: { _id: 1 } });
    if (!anyMember) return "open";
    return "none";
  }
  const members = await listBoardMembers(orgId, boardId);
  if (members.length === 0) return "open";
  const member = members.find((m) => m.userId === userId);
  return member?.role ?? "none";
}

export function roleCanRead(role: BoardRole | "none" | "open"): boolean {
  return role !== "none";
}

export function roleCanEdit(role: BoardRole | "none" | "open"): boolean {
  return role === "editor" || role === "admin" || role === "open";
}

export function roleCanAdmin(role: BoardRole | "none" | "open"): boolean {
  return role === "admin";
}
