import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { getStore } from "./storage";
import { normalizeTeamRole, type TeamRole } from "./rbac";

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

let teamIndexesEnsured = false;
async function ensureTeamIndexes(db: Db): Promise<void> {
  if (teamIndexesEnsured) return;
  await db.collection(COL).createIndex({ orgId: 1 });
  await db.collection(COL).createIndex({ orgId: 1, boardId: 1 });
  await db.collection(COL).createIndex({ orgId: 1, userId: 1 });
  teamIndexesEnsured = true;
}

function kvKey(orgId: string): string {
  return `team_members:${orgId}`;
}

function withNormalizedRoles(rows: TeamMember[]): TeamMember[] {
  return rows.map((r) => ({ ...r, role: normalizeTeamRole(r.role) }));
}

export async function listTeamMembers(orgId: string, boardId?: string): Promise<TeamMember[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureTeamIndexes(db);
    const q = boardId ? { orgId, boardId } : { orgId };
    const raw = await db.collection<TeamMember>(COL).find(q).toArray();
    return withNormalizedRoles(raw);
  }
  const store = await getStore();
  const rows = (await store.get<TeamMember[]>(kvKey(orgId))) ?? [];
  const filtered = boardId ? rows.filter((r) => (r.boardId ?? "") === boardId) : rows;
  return withNormalizedRoles(filtered);
}

export async function upsertTeamMember(input: TeamMember): Promise<TeamMember> {
  const row: TeamMember = { ...input, role: normalizeTeamRole(input.role) };
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureTeamIndexes(db);
    await db.collection<TeamMember>(COL).updateOne(
      { orgId: row.orgId, userId: row.userId, boardId: row.boardId ?? null } as never,
      { $set: row },
      { upsert: true }
    );
    return row;
  }
  const store = await getStore();
  const rows = (await store.get<TeamMember[]>(kvKey(row.orgId))) ?? [];
  const idx = rows.findIndex((r) => r.userId === row.userId && (r.boardId ?? "") === (row.boardId ?? ""));
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
  await store.set(kvKey(row.orgId), rows);
  return row;
}

/**
 * Papel do vínculo ativo em Equipe com escopo **organização inteira** (`boardId` vazio), ou `null`.
 * Alinha listagem/acesso a boards com “Organização inteira” (`team_manager` | `member` | `guest`).
 */
export async function getOrgWideTeamBoardAccess(
  orgId: string,
  userId: string
): Promise<TeamRole | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureTeamIndexes(db);
    const rows = await db
      .collection<TeamMember>(COL)
      .find({ orgId, userId, active: true } as never)
      .toArray();
    for (const m of rows) {
      if (String(m.boardId ?? "").trim()) continue;
      return normalizeTeamRole(m.role);
    }
    return null;
  }
  const members = await listTeamMembers(orgId);
  for (const m of members) {
    if (m.userId !== userId || !m.active) continue;
    if (String(m.boardId ?? "").trim()) continue;
    return normalizeTeamRole(m.role);
  }
  return null;
}

/**
 * IDs de boards em que o utilizador tem vínculo de Equipe ativo com escopo desse board (`boardId` preenchido).
 * Não inclui escopo org-wide (`boardId` vazio).
 */
export async function listActiveBoardScopedTeamBoardIdsForUser(orgId: string, userId: string): Promise<string[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureTeamIndexes(db);
    const rows = await db
      .collection<TeamMember>(COL)
      .find({ orgId, userId, active: true } as never)
      .toArray();
    const out: string[] = [];
    for (const m of rows) {
      const bid = String(m.boardId ?? "").trim();
      if (bid) out.push(bid);
    }
    return [...new Set(out)];
  }
  const members = await listTeamMembers(orgId);
  const out: string[] = [];
  for (const m of members) {
    if (m.userId !== userId || !m.active) continue;
    const bid = String(m.boardId ?? "").trim();
    if (bid) out.push(bid);
  }
  return [...new Set(out)];
}

export async function removeTeamMember(orgId: string, userId: string, boardId?: string): Promise<boolean> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureTeamIndexes(db);
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
