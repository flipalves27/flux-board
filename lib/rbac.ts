export type PlatformRole = "platform_admin" | "platform_user";
export type OrgRole = "org_manager" | "org_member";
export type TeamRole = "team_manager" | "member" | "guest";

export function normalizeTeamRole(role: unknown): TeamRole {
  if (role === "team_admin" || role === "team_manager") return "team_manager";
  if (role === "member") return "member";
  if (role === "guest") return "guest";
  return "member";
}

export type EffectiveRoles = {
  platformRole: PlatformRole;
  orgRole: OrgRole;
};

export function deriveEffectiveRoles(input: {
  id?: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole;
}): EffectiveRoles {
  const platformRole =
    input.platformRole ?? (input.id === "admin" ? "platform_admin" : "platform_user");
  const orgRole =
    input.orgRole ?? (input.isAdmin || input.isExecutive ? "org_manager" : "org_member");
  return { platformRole, orgRole };
}

export function isPlatformAdmin(roles: EffectiveRoles): boolean {
  return roles.platformRole === "platform_admin";
}

/** Cliente ou servidor: mesmo critério do JWT após `deriveEffectiveRoles` (ex.: usuário seed `admin`). */
export function isPlatformAdminSession(user: {
  id: string;
  platformRole?: PlatformRole;
  orgRole?: OrgRole;
}): boolean {
  return isPlatformAdmin(deriveEffectiveRoles(user));
}

export function canManageOrganization(roles: EffectiveRoles): boolean {
  return isPlatformAdmin(roles) || roles.orgRole === "org_manager";
}

/**
 * Billing, troca de plano, portal Stripe, convites org e diretório de usuários (admin/exec da org ou admin da plataforma).
 * Mais restrito que `sessionCanManageMembersAndBilling` (gestores de Equipe não alteram plano nem convites globais).
 */
export function sessionCanManageOrgBilling(user: {
  id: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole;
}): boolean {
  return canManageOrganization(deriveEffectiveRoles(user));
}

/** Para gates de plano: distingue admin da plataforma (fora do Stripe) de admin da org. */
export function isPlatformAdminFromAuthPayload(payload: {
  id: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole;
}): boolean {
  return isPlatformAdmin(deriveEffectiveRoles(payload));
}

/** Cliente: alinhado a `ensureOrgTeamManager` (membros, convites, billing). */
export function sessionCanManageMembersAndBilling(user: {
  platformRole?: PlatformRole;
  isOrgTeamManager?: boolean;
}): boolean {
  if (user.platformRole === "platform_admin") return true;
  return Boolean(user.isOrgTeamManager);
}
