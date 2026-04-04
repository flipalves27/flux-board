"use server";

import { randomUUID } from "crypto";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  getUserByUsername,
  getUserByEmail,
  ensureAdminUser,
  createUser,
  listUsers,
  deleteUser,
  listMembershipOrgIdsForUser,
} from "@/lib/kv-users";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import {
  createOrganization,
  updateOrganizationOwner,
  getOrganizationById,
} from "@/lib/kv-organizations";
import {
  acceptOrganizationInviteForExistingUser,
  type AcceptOrgInviteErrorCode,
} from "@/lib/accept-organization-invite";
import { consumeOrganizationInvite, validateOrganizationInvite } from "@/lib/kv-organization-invites";
import { getUserCap } from "@/lib/plan-gates";
import type { ThemePreference } from "@/lib/theme-storage";
import {
  issueSessionForCredentials,
  switchSessionToOrg,
  validateSessionFromCookies,
} from "@/lib/server-session";
import type { ValidateResult } from "@/lib/auth-types";
import { canManageOrganization, deriveEffectiveRoles, seesAllBoardsInOrg } from "@/lib/rbac";
import { insertAuditEvent } from "@/lib/audit-events";
import { auditOrganizationInviteAccepted } from "@/lib/invite-audit";
import { DEFAULT_PLATFORM_NAME } from "@/lib/org-branding";
export type { ValidateResult } from "@/lib/auth-types";

async function loginInviteErrorMessage(code: AcceptOrgInviteErrorCode): Promise<string> {
  const t = await getTranslations("login.errors");
  switch (code) {
    case "invite_invalid":
      return t("inviteInvalid");
    case "invite_plan_limit":
      return t("invitePlanLimit");
    case "invite_consume_failed":
      return t("inviteConsumeFailed");
    case "invite_platform_admin":
      return t("invitePlatformAdmin");
    case "oauth_account_conflict":
      return t("inviteOAuthConflict");
    default:
      return t("inviteInvalid");
  }
}

export type AuthResult =
  | {
      ok: true;
      user: {
        id: string;
        username: string;
        name: string;
        email: string;
        isAdmin: boolean;
        isExecutive?: boolean;
        orgId: string;
        platformRole: "platform_admin" | "platform_user";
        orgRole: "gestor" | "membro" | "convidado";
        seesAllBoardsInOrg?: boolean;
        themePreference?: ThemePreference;
        boardProductTourCompleted?: boolean;
        isOrgTeamManager?: boolean;
      };
    }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Server Action para login. Executa no servidor, evitando 403 da Vercel
 * Deployment Protection (que bloqueia requisições POST do cliente).
 * Define cookies httpOnly (access + refresh); não devolve JWT ao cliente.
 */
export async function loginAction(
  username: string,
  password: string,
  remember = true,
  inviteCode?: string
): Promise<AuthResult> {
  try {
    const clientIp = getClientIpFromHeaders(await headers());
    const rl = await rateLimit({
      key: `auth:login:ip:${clientIp}`,
      limit: 5,
      windowMs: 60 * 1000, // 1 minuto
    });
    if (!rl.allowed) {
      console.warn("[rate-limit] blocked loginAction", {
        clientIp,
        retryAfterSeconds: rl.retryAfterSeconds,
      });
      return {
        ok: false,
        error: `Muitas tentativas. Tente novamente em ${rl.retryAfterSeconds}s.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      };
    }

    await ensureAdminUser();
    const ident = (username || "").trim();
    let user = ident.includes("@")
      ? await getUserByEmail(ident)
      : await getUserByUsername(ident);

    if (!user) {
      return { ok: false, error: "Usuário ou senha inválidos" };
    }
    if (user.passwordHash === null) {
      const t = await getTranslations("login.errors");
      return { ok: false, error: t("oauthPasswordOnly") };
    }
    if (!verifyPassword(password, user.passwordHash)) {
      return { ok: false, error: "Usuário ou senha inválidos" };
    }

    const inviteTrim = inviteCode?.trim();
    if (inviteTrim) {
      const accepted = await acceptOrganizationInviteForExistingUser({
        user,
        inviteCode: inviteTrim,
      });
      if (!accepted.ok) {
        return { ok: false, error: await loginInviteErrorMessage(accepted.error) };
      }
      user = accepted.user;
    }

    const isExecutive = !!user.isExecutive;
    const roles = deriveEffectiveRoles({
      id: user.id,
      isAdmin: user.id === "admin" || !!user.isAdmin,
      isExecutive,
      platformRole: user.platformRole,
      orgRole: user.orgRole,
    });
    const sees = seesAllBoardsInOrg(roles);
    const canManage = canManageOrganization(roles);
    await issueSessionForCredentials(
      {
        id: user.id,
        username: user.username,
        isAdmin: user.id === "admin" || !!user.isAdmin,
        ...(isExecutive ? { isExecutive: true } : {}),
        orgId: user.orgId,
        platformRole: roles.platformRole,
        orgRole: roles.orgRole,
      },
      remember
    );
    await insertAuditEvent({
      action: "auth.login_success",
      resourceType: "auth",
      actorUserId: user.id,
      resourceId: user.id,
      orgId: user.orgId,
      ip: clientIp,
    });
    return {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin: sees,
        seesAllBoardsInOrg: sees,
        ...(isExecutive ? { isExecutive: true } : {}),
        orgId: user.orgId,
        platformRole: roles.platformRole,
        orgRole: roles.orgRole,
        ...(canManage ? { isOrgTeamManager: true } : {}),
        ...(user.themePreference ? { themePreference: user.themePreference } : {}),
        ...(user.boardProductTourCompleted ? { boardProductTourCompleted: true } : {}),
      },
    };
  } catch (err) {
    console.error("Login error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro interno",
    };
  }
}

/**
 * Server Action para registro. Executa no servidor, evitando 403 da Vercel
 * Deployment Protection.
 */
export async function registerAction(
  name: string,
  email: string,
  password: string,
  inviteCode?: string,
  remember = true
): Promise<AuthResult> {
  try {
    const clientIp = getClientIpFromHeaders(await headers());
    const rl = await rateLimit({
      key: `auth:register:ip:${clientIp}`,
      limit: 3,
      windowMs: 10 * 60 * 1000, // 10 minutos
    });
    if (!rl.allowed) {
      console.warn("[rate-limit] blocked registerAction", {
        clientIp,
        retryAfterSeconds: rl.retryAfterSeconds,
      });
      return {
        ok: false,
        error: `Muitas tentativas de cadastro. Tente novamente em ${rl.retryAfterSeconds}s.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      };
    }

    const emailNorm = (email || "").trim().toLowerCase();
    const nameTrim = (name || "").trim().slice(0, 100);

    if (password.length < 8) {
      return { ok: false, error: "Senha deve ter pelo menos 8 caracteres." };
    }

    await ensureAdminUser();

    const existing = await getUserByEmail(emailNorm);
    if (existing) {
      if (inviteCode?.trim()) {
        const forInvite = await validateOrganizationInvite({ code: inviteCode.trim(), email: emailNorm });
        if (forInvite) {
          const tReg = await getTranslations("login.errors");
          return { ok: false, error: tReg("registerUseLoginForInvite") };
        }
      }
      return { ok: false, error: "E-mail já cadastrado." };
    }

    if (inviteCode) {
      const validated = await validateOrganizationInvite({ code: inviteCode, email: emailNorm });
      if (!validated) return { ok: false, error: "Convite inválido ou expirado." };

      const org = await getOrganizationById(validated.orgId);
      const members = await listUsers(validated.orgId);
      const cap = getUserCap(org);
      if (cap !== null && members.length >= cap) {
        return { ok: false, error: `Limite do plano: no máximo ${cap} usuário(s).` };
      }

      const invitedRole = validated.assignedOrgRole;
      const user = await createUser({
        username: emailNorm,
        name: nameTrim || emailNorm,
        email: emailNorm,
        passwordHash: hashPassword(password),
        orgId: validated.orgId,
        isAdmin: invitedRole === "gestor",
        orgRole: invitedRole,
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
        return { ok: false, error: "Convite já foi utilizado." };
      }

      await auditOrganizationInviteAccepted({
        orgId: validated.orgId,
        joiningUserId: user.id,
        inviteCode,
        emailLower: emailNorm,
      });

      await issueSessionForCredentials(
        {
          id: user.id,
          username: user.username,
          isAdmin: user.id === "admin" || !!user.isAdmin,
          orgId: user.orgId,
          platformRole: roles.platformRole,
          orgRole: roles.orgRole,
        },
        remember
      );
      const seesInv = seesAllBoardsInOrg(roles);
      const canManageInv = canManageOrganization(roles);
      return {
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          isAdmin: seesInv,
          seesAllBoardsInOrg: seesInv,
          orgId: user.orgId,
          platformRole: roles.platformRole,
          orgRole: roles.orgRole,
          ...(canManageInv ? { isOrgTeamManager: true } : {}),
          ...(user.themePreference ? { themePreference: user.themePreference } : {}),
          ...(user.boardProductTourCompleted ? { boardProductTourCompleted: true } : {}),
        },
      };
    }

    const orgOwnerPlaceholder = `pending_${Date.now()}`;
    // Keep platform naming consistent on self-signup (avoid deriving from email domain).
    const org = await createOrganization({
      ownerId: orgOwnerPlaceholder,
      name: DEFAULT_PLATFORM_NAME,
      slug: "flux-board",
      plan: "trial",
    });

    const user = await createUser({
      username: emailNorm,
      name: nameTrim || emailNorm,
      email: emailNorm,
      passwordHash: hashPassword(password),
      orgId: org._id,
      isAdmin: true,
      orgRole: "gestor",
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
      remember
    );
    const seesNew = seesAllBoardsInOrg(roles);
    const canManageNew = canManageOrganization(roles);
    return {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin: seesNew,
        seesAllBoardsInOrg: seesNew,
        orgId: user.orgId,
        platformRole: roles.platformRole,
        orgRole: roles.orgRole,
        ...(canManageNew ? { isOrgTeamManager: true } : {}),
        ...(user.themePreference ? { themePreference: user.themePreference } : {}),
        ...(user.boardProductTourCompleted ? { boardProductTourCompleted: true } : {}),
      },
    };
  } catch (err) {
    console.error("Register error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro interno",
    };
  }
}

/**
 * Valida sessão (cookies httpOnly) ou renova access via refresh com rotação.
 * No browser, o fluxo principal usa `GET /api/auth/session` (`fetchSessionValidate`) para evitar colisão com RSC.
 */
export async function validateSessionAction(): Promise<ValidateResult> {
  try {
    return await validateSessionFromCookies();
  } catch {
    const supportRef = randomUUID();
    if (process.env.FLUX_SESSION_VALIDATE_LOG !== "0") {
      console.warn(
        "[flux-session-validate]",
        JSON.stringify({ event: "fail", reason: "validate_exception", supportRef })
      );
    }
    return { ok: false, supportRef, failureKind: "unknown" };
  }
}

export type MyOrganizationRow = { orgId: string; name: string };

export async function listMyOrganizationsAction(): Promise<
  { ok: true; orgs: MyOrganizationRow[] } | { ok: false }
> {
  try {
    const session = await validateSessionFromCookies();
    if (!session.ok) return { ok: false };
    const ids = await listMembershipOrgIdsForUser(session.user.id);
    const rows: MyOrganizationRow[] = await Promise.all(
      ids.map(async (orgId) => {
        const o = await getOrganizationById(orgId);
        const name = (o?.name ?? orgId).trim() || orgId;
        return { orgId, name };
      })
    );
    rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return { ok: true, orgs: rows };
  } catch {
    return { ok: false };
  }
}

export async function switchOrganizationAction(orgId: string): Promise<ValidateResult> {
  try {
    const session = await validateSessionFromCookies();
    if (!session.ok) return { ok: false };
    return await switchSessionToOrg(session.user.id, orgId, true);
  } catch {
    return { ok: false };
  }
}
