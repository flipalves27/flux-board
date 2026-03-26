import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";
import type { TeamRole } from "./rbac";

type TeamMember = {
  orgId: string;
  userId: string;
  boardId?: string;
  role: TeamRole;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
};

const COL = "team_members";

function kvKey(orgId: string): string {
  return `team_members:${orgId}`;
}

export async function listTeamMembers(orgId: string, boardId?: string): Promise<TeamMember[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    const q = boardId ? { orgId, boardId } : { orgId };
    return db.collection<TeamMember>(COL).find(q).toArray();
  }
  const store = await getStore();
  const rows = (await store.get<TeamMember[]>(kvKey(orgId))) ?? [];
  return boardId ? rows.filter((r) => (r.boardId ?? "") === boardId) : rows;
}

export async function upsertTeamMember(input: TeamMember): Promise<TeamMember> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await db.collection<TeamMember>(COL).updateOne(
      { orgId: input.orgId, userId: input.userId, boardId: input.boardId ?? null } as never,
      { $set: input },
      { upsert: true }
    );
    return input;
  }
  const store = await getStore();
  const rows = (await store.get<TeamMember[]>(kvKey(input.orgId))) ?? [];
  const idx = rows.findIndex((r) => r.userId === input.userId && (r.boardId ?? "") === (input.boardId ?? ""));
  if (idx >= 0) rows[idx] = input;
  else rows.push(input);
  await store.set(kvKey(input.orgId), rows);
  return input;
}

export async function removeTeamMember(orgId: string, userId: string, boardId?: string): Promise<boolean> {
  if (isMongoConfigured()) {
    const db = await getDb();
    const result = await db.collection<TeamMember>(COL).deleteOne({
      orgId,
      userId,
      boardId: boardId ?? null,
    } as never);
    return (result.deletedCount ?? 0) > 0;
  }
  const store = await getStore();
  const rows = (await store.get<TeamMember[]>(kvKey(orgId))) ?? [];
  const next = rows.filter((r) => !(r.userId === userId && (r.boardId ?? "") === (boardId ?? "")));
  if (next.length === rows.length) return false;
  await store.set(kvKey(orgId), next);
  return true;
}
