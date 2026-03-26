export type PlatformRole = "platform_admin" | "platform_user";
export type OrgRole = "org_manager" | "org_member";
export type TeamRole = "team_admin" | "member" | "guest";

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

export function canManageOrganization(roles: EffectiveRoles): boolean {
  return isPlatformAdmin(roles) || roles.orgRole === "org_manager";
}
