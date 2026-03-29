import type { OrgRole, PlatformRole } from "./rbac";
import { isPlatformAdminSession } from "./rbac";

export type PlanUiUser = {
  id: string;
  platformRole?: PlatformRole;
  orgRole?: OrgRole;
};

/**
 * Admin da plataforma não está no fluxo comercial Stripe; esconder CTAs de trial/upgrade baseados só em `org.plan`.
 */
export function shouldHideOrgBillingNudges(user: PlanUiUser | null | undefined): boolean {
  if (!user) return false;
  return isPlatformAdminSession(user);
}
