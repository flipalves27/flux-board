import "server-only";

import { routing } from "@/i18n";
import { deriveEffectiveRoles } from "@/lib/rbac";
import { issueSessionForCredentials } from "@/lib/server-session";
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
import { consumeOrganizationInvite, validateOrganizationInvite } from "@/lib/kv-organization-invites";
import {
  createTrialOrganizationForSignup,
  getOrganizationById,
  updateOrganizationOwner,
} from "@/lib/kv-organizations";
import { getUserCap } from "@/lib/plan-gates";

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
  if (redirect && redirect.startsWith("/")) {
    return redirect;
  }
  if (isNewUser) {
    return `${root}/onboarding`;
  }
  return `${root}/boards`;
}

async function issueSessionForUser(user: User): Promise<void> {
  const isAdmin = user.id === "admin" || !!user.isAdmin;
  const isExecutive = !!user.isExecutive;
  const roles = deriveEffectiveRoles({
    id: user.id,
    isAdmin,
    isExecutive,
    platformRole: user.platformRole,
    orgRole: user.orgRole,
  });
  await issueSessionForCredentials(
    {
      id: user.id,
      username: user.username,
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
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
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

  const byOAuth = await findUserByOAuthProviderSubject(profile.provider, profile.subject);
  if (byOAuth) {
    await issueSessionForUser(byOAuth);
    return {
      ok: true,
      path: postAuthPath(profile.locale, profile.redirect, false),
    };
  }

  const byEmail = await getUserByEmail(emailNorm);
  if (byEmail) {
    const existing = byEmail.oauthLinks?.find((l) => l.provider === profile.provider);
    if (existing && existing.subject !== profile.subject) {
      return { ok: false, error: "oauth_account_conflict" };
    }
    const merged = await appendOAuthLink(byEmail.id, byEmail.orgId, link);
    if (!merged) {
      return { ok: false, error: "oauth_account_conflict" };
    }
    await issueSessionForUser(merged);
    return {
      ok: true,
      path: postAuthPath(profile.locale, profile.redirect, false),
    };
  }

  const inviteCode = profile.invite?.trim();

  if (inviteCode) {
    const validated = await validateOrganizationInvite({ code: inviteCode, email: emailNorm });
    if (!validated) {
      return { ok: false, error: "oauth_invite_invalid" };
    }
    const org = await getOrganizationById(validated.orgId);
    const members = await listUsers(validated.orgId);
    const cap = org ? getUserCap(org) : null;
    if (cap !== null && members.length >= cap) {
      return { ok: false, error: "oauth_plan_limit" };
    }

    const user = await createUser({
      username: emailNorm,
      name: displayName,
      email: emailNorm,
      passwordHash: null,
      orgId: validated.orgId,
      isAdmin: false,
      orgRole: "org_member",
      oauthLinks: [link],
    });

    const roles = deriveEffectiveRoles({
      id: user.id,
      isAdmin: false,
      platformRole: user.platformRole,
      orgRole: user.orgRole,
    });

    const ok = await consumeOrganizationInvite({ code: inviteCode, email: emailNorm, userId: user.id });
    if (!ok) {
      await deleteUser(user.id, validated.orgId);
      return { ok: false, error: "oauth_consume_failed" };
    }

    await issueSessionForCredentials(
      {
        id: user.id,
        username: user.username,
        isAdmin: false,
        orgId: user.orgId,
        platformRole: roles.platformRole,
        orgRole: roles.orgRole,
      },
      true
    );

    return {
      ok: true,
      path: postAuthPath(profile.locale, profile.redirect, true),
    };
  }

  const orgOwnerPlaceholder = `pending_${Date.now()}`;
  const org = await createTrialOrganizationForSignup(orgOwnerPlaceholder, emailNorm);

  const user = await createUser({
    username: emailNorm,
    name: displayName,
    email: emailNorm,
    passwordHash: null,
    orgId: org._id,
    isAdmin: true,
    orgRole: "org_manager",
    oauthLinks: [link],
  });

  const roles = deriveEffectiveRoles({
    id: user.id,
    isAdmin: true,
    platformRole: user.platformRole,
    orgRole: user.orgRole,
  });

  await updateOrganizationOwner(org._id, user.id);

  await issueSessionForCredentials(
    {
      id: user.id,
      username: user.username,
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
  };
}
