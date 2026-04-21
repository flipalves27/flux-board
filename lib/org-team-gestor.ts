import { listUsers, loadUserByIdFromStore } from "./kv-users";
import { listTeamMembers, upsertTeamMember } from "./kv-team-members";
import { normalizeTeamRole } from "./rbac";

function isOrgScopedGestorRow(m: { boardId?: string; active: boolean; role: unknown; userId: string }): boolean {
  return m.active && !(m.boardId ?? "") && normalizeTeamRole(m.role) === "team_manager";
}

/** Há pelo menos um gestor ativo com escopo de organização (sem board). */
export async function orgHasOrgScopedTeamManager(orgId: string): Promise<boolean> {
  const members = await listTeamMembers(orgId);
  return members.some((m) => isOrgScopedGestorRow(m));
}

async function seedLegacyOrgManagersAsTeamGestors(orgId: string, actorUserId: string): Promise<void> {
  const now = new Date().toISOString();
  const lite = await listUsers(orgId);
  for (const row of lite) {
    const full = await loadUserByIdFromStore(row.id, orgId);
    if (!full) continue;
    const elevated =
      full.isAdmin ||
      !!full.isExecutive ||
      full.orgRole === "gestor" ||
      full.orgRole === "org_manager";
    if (!elevated) continue;
    await upsertTeamMember({
      orgId,
      userId: full.id,
      role: "team_manager",
      active: true,
      updatedAt: now,
      updatedBy: actorUserId,
    });
  }
}

/**
 * Pode gerenciar membros da org e billing: vínculo **Gestor** ativo (Equipe, escopo organização).
 * Se a org ainda não tiver nenhum gestor explícito, admin/executivo existentes recebem o vínculo de gestor
 * (migração suave); depois disso só quem tiver esse vínculo continua autorizado.
 */
export async function userIsActiveOrgTeamManager(orgId: string, userId: string): Promise<boolean> {
  let members = await listTeamMembers(orgId);
  if (members.some((m) => m.userId === userId && isOrgScopedGestorRow(m))) return true;
  if (members.some((m) => isOrgScopedGestorRow(m))) return false;

  const user = await loadUserByIdFromStore(userId, orgId);
  if (!user || (!user.isAdmin && !user.isExecutive)) return false;

  await seedLegacyOrgManagersAsTeamGestors(orgId, userId);
  members = await listTeamMembers(orgId);
  return members.some((m) => m.userId === userId && isOrgScopedGestorRow(m));
}
