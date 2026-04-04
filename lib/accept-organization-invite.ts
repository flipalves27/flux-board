import "server-only";

import {
  appendOAuthLink,
  getUserRecordById,
  updateUser,
  listUsers,
  addOrgMembership,
  loadUserDocumentById,
  getUserById,
  removeExtraOrgMembership,
  type OAuthLink,
  type User,
} from "@/lib/kv-users";
import { consumeOrganizationInvite, validateOrganizationInvite } from "@/lib/kv-organization-invites";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getUserCap } from "@/lib/plan-gates";
import { auditOrganizationInviteAccepted } from "@/lib/invite-audit";
import type { OrgMembershipRole } from "@/lib/rbac";

export type AcceptOrgInviteErrorCode =
  | "invite_invalid"
  | "invite_plan_limit"
  | "invite_consume_failed"
  | "invite_platform_admin"
  | "oauth_account_conflict";

function membershipIsAdminFlag(role: OrgMembershipRole): boolean {
  return role === "gestor";
}

/**
 * Associa o utilizador à organização do convite (multi-org: não remove a org principal).
 */
export async function acceptOrganizationInviteForExistingUser(params: {
  user: User;
  inviteCode: string;
  oauthLink?: OAuthLink;
}): Promise<{ ok: true; user: User } | { ok: false; error: AcceptOrgInviteErrorCode }> {
  const emailNorm = params.user.email.trim().toLowerCase();
  const code = String(params.inviteCode || "").trim();
  if (!code || !emailNorm) return { ok: false, error: "invite_invalid" };

  const validated = await validateOrganizationInvite({ code, email: emailNorm });
  if (!validated) return { ok: false, error: "invite_invalid" };

  const targetOrgId = validated.orgId;
  const invitedRole = validated.assignedOrgRole;
  let user = await getUserRecordById(params.user.id);
  if (!user) return { ok: false, error: "invite_invalid" };

  if (user.id === "admin" || user.platformRole === "platform_admin") {
    return { ok: false, error: "invite_platform_admin" };
  }

  if (params.oauthLink) {
    const merged = await appendOAuthLink(user.id, user.orgId, params.oauthLink);
    if (!merged) return { ok: false, error: "oauth_account_conflict" };
    user = merged;
  }

  const org = await getOrganizationById(targetOrgId);
  const members = await listUsers(targetOrgId);
  const alreadyInTarget = members.some((m) => m.id === user.id);
  if (!alreadyInTarget) {
    const cap = org ? getUserCap(org) : null;
    if (cap !== null && members.length >= cap) {
      return { ok: false, error: "invite_plan_limit" };
    }
  }

  const base = await loadUserDocumentById(user.id);
  if (!base) return { ok: false, error: "invite_invalid" };

  const samePrimary = base.orgId === targetOrgId;
  const inExtra = base.orgMemberships?.some((m) => m.orgId === targetOrgId);
  if (samePrimary || inExtra) {
    const updated = await updateUser(user.id, targetOrgId, {
      orgRole: invitedRole,
      isAdmin: membershipIsAdminFlag(invitedRole),
    });
    if (!updated) return { ok: false, error: "invite_invalid" };
    const consumed = await consumeOrganizationInvite({ code, email: emailNorm, userId: user.id });
    if (!consumed) return { ok: false, error: "invite_consume_failed" };
    await auditOrganizationInviteAccepted({
      orgId: targetOrgId,
      joiningUserId: user.id,
      inviteCode: code,
      emailLower: emailNorm,
    });
    const scoped = await getUserById(user.id, targetOrgId);
    return scoped ? { ok: true, user: scoped } : { ok: false, error: "invite_invalid" };
  }

  const joined = await addOrgMembership({
    userId: user.id,
    orgId: targetOrgId,
    orgRole: invitedRole,
    isAdmin: membershipIsAdminFlag(invitedRole),
  });
  if (!joined) return { ok: false, error: "invite_invalid" };

  const consumed = await consumeOrganizationInvite({ code, email: emailNorm, userId: user.id });
  if (!consumed) {
    await removeExtraOrgMembership(user.id, targetOrgId);
    return { ok: false, error: "invite_consume_failed" };
  }
  await auditOrganizationInviteAccepted({
    orgId: targetOrgId,
    joiningUserId: user.id,
    inviteCode: code,
    emailLower: emailNorm,
  });

  const scoped = await getUserById(user.id, targetOrgId);
  return scoped ? { ok: true, user: scoped } : { ok: false, error: "invite_invalid" };
}
