import { isPlatformAdmin, type OrgRole, type PlatformRole } from "./rbac";

/** Shape returned by `getAuthFromRequest` for tenant checks. */
export type TenantAuthPayload = {
  id: string;
  orgId: string;
  platformRole: PlatformRole;
  orgRole: OrgRole;
};

/**
 * Recurso escopado por organização na URL (`/api/orgs/[orgId]/...`):
 * só a própria org ou administrador da plataforma (nunca org admin de outro tenant).
 */
export function isSameOrgOrPlatformAdmin(payload: TenantAuthPayload, routeOrgId: string): boolean {
  return routeOrgId === payload.orgId || isPlatformAdmin(payload);
}
