import "server-only";

import { routing } from "@/i18n";
import { deriveEffectiveRoles } from "@/lib/rbac";
import { createSessionTokensForCredentials } from "@/lib/server-session";
import {
  appendOAuthLink,
  createUser,
  deleteUser,
  ensureAdminUser,
  findUserByOAuthProviderSubject,
  getUserByEmail,
  listUsers,
  type OAuthProviderId,
  type User,
} from "@/lib/kv-users";
import {
  acceptOrganizationInviteForExistingUser,
  type AcceptOrgInviteErrorCode,
} from "@/lib/accept-organization-invite";
import { consumeOrganizationInvite, validateOrganizationInvite } from "@/lib/kv-organization-invites";
import {
  createOrganization,
  getOrganizationById,
  updateOrganizationOwner,
} from "@/lib/kv-organizations";
import { DEFAULT_PLATFORM_NAME } from "@/lib/org-branding";
import { getUserCap } from "@/lib/plan-gates";
import { appendJoinedViaInviteQuery } from "@/lib/invite-join-feedback";
import { sanitizeOAuthReturnPath } from "@/lib/oauth/safe-redirect";
import { auditOrganizationInviteAccepted } from "@/lib/invite-audit";

export type OAuthSignInProfile = {
  provider: OAuthProviderId;
  subject: string;
  email: string;
  name: string;
  emailVerified: boolean;
  invite?: string;
  redirect?: string;
  locale: string;
};

function normalizeLocale(locale: string): string {
  const l = (locale || "").trim();
  if ((routing.locales as readonly string[]).includes(l)) return l;
  return routing.defaultLocale;
}

function postAuthPath(locale: string, redirect: string | undefined, isNewUser: boolean): string {
  const root = `/${normalizeLocale(locale)}`;
  const safe = sanitizeOAuthReturnPath(redirect);
  if (safe) {
    return safe;
  }
  if (isNewUser) {
    return `${root}/onboarding`;
  }
  return `${root}/boards`;
}

function mapAcceptOrgInviteErrorToOAuth(code: AcceptOrgInviteErrorCode): string {
  switch (code) {
    case "invite_invalid":
      return "oauth_invite_invalid";
    case "invite_plan_limit":
      return "oauth_plan_limit";
    case "invite_consume_failed":
      return "oauth_consume_failed";
    case "invite_platform_admin":
      return "oauth_invite_platform_admin";
    case "oauth_account_conflict":
      return "oauth_account_conflict";
    default:
      return "oauth_invite_invalid";
  }
}

async function createOAuthSessionTokensForUser(
  user: User
): Promise<{ access: string; refreshPlain: string }> {
  const isAdmin = user.id === "admin" || !!user.isAdmin;
  const isExecutive = !!user.isExecutive;
  const roles = deriveEffectiveRoles({
    id: user.id,
    isAdmin,
    isExecutive,
    platformRole: user.platformRole,
    orgRole: user.orgRole,
  });
  return createSessionTokensForCredentials(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      isAdmin,
      ...(isExecutive ? { isExecutive: true } : {}),
      orgId: user.orgId,
      platformRole: roles.platformRole,
      orgRole: roles.orgRole,
    },
    true
  );
}

export async function completeOAuthSignIn(
  profile: OAuthSignInProfile
): Promise<
  | { ok: true; path: string; access: string; refreshPlain: string }
  | { ok: false; error: string }
> {
  if (!profile.emailVerified) {
    return { ok: false, error: "oauth_email_unverified" };
  }
  const emailNorm = profile.email.trim().toLowerCase();
  if (!emailNorm || !profile.subject) {
    return { ok: false, error: "oauth_no_email" };
  }
  const displayName = (profile.name || "").trim() || emailNorm.split("@")[0] || emailNorm;
  const link = { provider: profile.provider, subject: profile.subject };

  await ensureAdminUser();

  const inviteCode = profile.invite?.trim();
  const byOAuth = await findUserByOAuthProviderSubject(profile.provider, profile.subject);
  const byEmail = byOAuth ? null : await getUserByEmail(emailNorm);
  const existingUser = byOAuth ?? byEmail;

  if (inviteCode) {
    const validated = await validateOrganizationInvite({ code: inviteCode, email: emailNorm });
    if (!validated) {
      return { ok: false, error: "oauth_invite_invalid" };
    }

    if (existingUser) {
      const accepted = await acceptOrganizationInviteForExistingUser({
        user: existingUser,
        inviteCode,
        oauthLink: byOAuth ? undefined : link,
      });
      if (!accepted.ok) {
        return { ok: false, error: mapAcceptOrgInviteErrorToOAuth(accepted.error) };
      }
      const { access, refreshPlain } = await createOAuthSessionTokensForUser(accepted.user);
      return {
        ok: true,
        path: appendJoinedViaInviteQuery(postAuthPath(profile.locale, profile.redirect, false)),
        access,
        refreshPlain,
      };
    }

    const org = await getOrganizationById(validated.orgId);
    const members = await listUsers(validated.orgId);
    const cap = org ? getUserCap(org) : null;
    if (cap !== null && members.length >= cap) {
      return { ok: false, error: "oauth_plan_limit" };
    }

    const invitedRole = validated.assignedOrgRole;
    const user = await createUser({
      username: emailNorm,
      name: displayName,
      email: emailNorm,
      passwordHash: null,
      orgId: validated.orgId,
      isAdmin: invitedRole === "gestor",
      orgRole: invitedRole,
      oauthLinks: [link],
    });

    const roles = deriveEffectiveRoles({
      id: user.id,
      isAdmin: user.id === "admin" || !!user.isAdmin,
      platformRole: user.platformRole,
      orgRole: user.orgRole,
    });

    const ok = await consumeOrganizationInvite({ code: inviteCode, email: emailNorm, userId: user.id });
    if (!ok) {
      await deleteUser(user.id, validated.orgId);
      return { ok: false, error: "oauth_consume_failed" };
    }

    await auditOrganizationInviteAccepted({
      orgId: validated.orgId,
      joiningUserId: user.id,
      inviteCode,
      emailLower: emailNorm,
    });

    const { access, refreshPlain } = await createSessionTokensForCredentials(
      {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin: user.id === "admin" || !!user.isAdmin,
        orgId: user.orgId,
        platformRole: roles.platformRole,
        orgRole: roles.orgRole,
      },
      true
    );

    return {
      ok: true,
      path: appendJoinedViaInviteQuery(postAuthPath(profile.locale, profile.redirect, true)),
      access,
      refreshPlain,
    };
  }

  if (byOAuth) {
    const { access, refreshPlain } = await createOAuthSessionTokensForUser(byOAuth);
    return {
      ok: true,
      path: postAuthPath(profile.locale, profile.redirect, false),
      access,
      refreshPlain,
    };
  }

  if (byEmail) {
    const existing = byEmail.oauthLinks?.find((l) => l.provider === profile.provider);
    if (existing && existing.subject !== profile.subject) {
      return { ok: false, error: "oauth_account_conflict" };
    }
    const merged = await appendOAuthLink(byEmail.id, byEmail.orgId, link);
    if (!merged) {
      return { ok: false, error: "oauth_account_conflict" };
    }
    const { access, refreshPlain } = await createOAuthSessionTokensForUser(merged);
    return {
      ok: true,
      path: postAuthPath(profile.locale, profile.redirect, false),
      access,
      refreshPlain,
    };
  }

  const orgOwnerPlaceholder = `pending_${Date.now()}`;
  // Preserve platform identity on first social signup instead of deriving org name from email domain.
  const org = await createOrganization({
    ownerId: orgOwnerPlaceholder,
    name: DEFAULT_PLATFORM_NAME,
    slug: "flux-board",
    plan: "trial",
  });

  const user = await createUser({
    username: emailNorm,
    name: displayName,
    email: emailNorm,
    passwordHash: null,
    orgId: org._id,
    isAdmin: true,
    orgRole: "gestor",
    oauthLinks: [link],
  });

  const roles = deriveEffectiveRoles({
    id: user.id,
    isAdmin: true,
    platformRole: user.platformRole,
    orgRole: user.orgRole,
  });

  await updateOrganizationOwner(org._id, user.id);

  const { access, refreshPlain } = await createSessionTokensForCredentials(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      isAdmin: true,
      orgId: user.orgId,
      platformRole: roles.platformRole,
      orgRole: roles.orgRole,
    },
    true
  );

  return {
    ok: true,
    path: postAuthPath(profile.locale, profile.redirect, true),
    access,
    refreshPlain,
  };
}
