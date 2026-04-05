import "server-only";

import { randomBytes, randomUUID } from "crypto";
import { cookies, headers } from "next/headers";
import { createToken, verifyToken } from "./auth";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./auth-cookie-names";
import { clearAuthCookies, setAuthCookies } from "./session-cookies";
import { isFluxAuthDebugEnabled, logFluxAuthDebug } from "./flux-auth-debug";
import { createRefreshSession, consumeRefreshSessionForRotation } from "./kv-refresh-sessions";
import { refreshRecordExpiresAt } from "./session-ttl";
import { getUserById } from "./kv-users";
import type { ThemePreference } from "./theme-storage";
import type { SessionValidateFailureKind, ValidateResult } from "./auth-types";
import type { User } from "./kv-users";
import {
  canManageOrganization,
  deriveEffectiveRoles,
  seesAllBoardsInOrg,
  type OrgRole,
  type PlatformRole,
} from "./rbac";

async function userToValidate(user: User | null): Promise<ValidateResult> {
  if (!user) return { ok: false };
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
      ...(user.themePreference ? { themePreference: user.themePreference as ThemePreference } : {}),
      ...(user.boardProductTourCompleted ? { boardProductTourCompleted: true } : {}),
    },
  };
}

/** Emite access JWT + refresh opaco (sem gravar cookies). Útil quando a sessão deve ir em `NextResponse` (ex.: redirect OAuth). */
export async function createSessionTokensForCredentials(
  user: {
    id: string;
    username: string;
    isAdmin: boolean;
    isExecutive?: boolean;
    orgId: string;
    platformRole?: PlatformRole;
    orgRole?: OrgRole;
  },
  remember: boolean
): Promise<{ access: string; refreshPlain: string }> {
  const access = createToken({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    isExecutive: user.isExecutive,
    orgId: user.orgId,
    platformRole: user.platformRole,
    orgRole: user.orgRole,
  });
  const familyId = randomBytes(16).toString("hex");
  const expiresAt = refreshRecordExpiresAt(remember);
  const { plain } = await createRefreshSession({
    userId: user.id,
    orgId: user.orgId,
    familyId,
    persistent: remember,
    expiresAt,
  });
  return { access, refreshPlain: plain };
}

export async function issueSessionForCredentials(
  user: {
    id: string;
    username: string;
    isAdmin: boolean;
    isExecutive?: boolean;
    orgId: string;
    platformRole?: PlatformRole;
    orgRole?: OrgRole;
  },
  remember: boolean
): Promise<void> {
  const { access, refreshPlain } = await createSessionTokensForCredentials(user, remember);
  await setAuthCookies(access, refreshPlain, remember);
}

/**
 * Valida refresh opaco, revoga o token anterior e emite par access+refresh.
 * Usado pela rota POST /api/auth/refresh e por validateSessionFromCookies.
 */
export type RotateSessionFromRefreshPlainResult =
  | { ok: true; access: string; refreshPlain: string; persistent: boolean; user: User }
  | { ok: false; clearCookies: boolean };

export async function rotateSessionFromRefreshPlain(refreshPlain: string): Promise<RotateSessionFromRefreshPlainResult> {
  const consumed = await consumeRefreshSessionForRotation(refreshPlain);
  if (consumed.kind !== "ok") {
    return {
      ok: false,
      clearCookies: consumed.kind !== "revoked_replay",
    };
  }
  const persistent = consumed.persistent ?? true;
  const user = await getUserById(consumed.userId, consumed.orgId);
  if (!user) return { ok: false, clearCookies: true };
  const accessNew = createToken({
    id: user.id,
    username: user.username,
    isAdmin: user.id === "admin" || !!user.isAdmin,
    isExecutive: !!user.isExecutive,
    orgId: user.orgId,
    platformRole: user.platformRole,
    orgRole: user.orgRole,
  });
  const expiresAt = refreshRecordExpiresAt(persistent);
  const { plain } = await createRefreshSession({
    userId: user.id,
    orgId: user.orgId,
    familyId: consumed.familyId,
    persistent,
    expiresAt,
  });
  return { ok: true, access: accessNew, refreshPlain: plain, persistent, user };
}

/** `FLUX_SESSION_VALIDATE_LOG=0` desliga os avisos (útil se o volume em staging incomodar). */
const SESSION_VALIDATE_LOG = process.env.FLUX_SESSION_VALIDATE_LOG !== "0";

function logSessionValidateFail(payload: Record<string, string | undefined>): void {
  if (!SESSION_VALIDATE_LOG) return;
  console.warn("[flux-session-validate]", JSON.stringify({ event: "fail", ...payload }));
}

/** Efeitos de cookie a aplicar no `cookies()` ou num `NextResponse` (rota HTTP). */
export type ValidateSessionCookieSideEffect =
  | { type: "set_rotated"; access: string; refreshPlain: string; persistent: boolean }
  | { type: "clear_all" };

/**
 * Núcleo de validação a partir dos valores dos cookies (sem `cookies()` do Next).
 * Usado por `validateSessionFromCookies` e por `GET /api/auth/session`.
 */
export async function validateSessionFromCookieValues(
  access: string | undefined,
  refresh: string | undefined,
  opts?: { requestHostForDebug?: string }
): Promise<{ result: ValidateResult; sideEffect: ValidateSessionCookieSideEffect | null }> {
  const supportRef = randomUUID();
  try {
    const hasAccess = Boolean(access?.trim());
    const hasRefresh = Boolean(refresh?.trim());

    const payload = access ? verifyToken(access) : null;

    if (!payload && refresh) {
      const rotated = await rotateSessionFromRefreshPlain(refresh);
      if (rotated.ok) {
        return {
          result: await userToValidate(rotated.user),
          sideEffect: {
            type: "set_rotated",
            access: rotated.access,
            refreshPlain: rotated.refreshPlain,
            persistent: rotated.persistent,
          },
        };
      }
      if (!rotated.clearCookies) {
        return {
          result: { ok: false, supportRef, failureKind: "token_invalid" },
          sideEffect: null,
        };
      }
    }

    if (!payload) {
      const failureKind: SessionValidateFailureKind = hasAccess || hasRefresh ? "token_invalid" : "no_cookies";
      if (hasAccess || hasRefresh) {
        const reason =
          hasAccess && hasRefresh ? "jwt_invalid_refresh_failed" : hasAccess ? "jwt_invalid_no_refresh" : "refresh_failed";
        logSessionValidateFail({ reason, supportRef });
        return { result: { ok: false, supportRef, failureKind }, sideEffect: { type: "clear_all" } };
      }
      if (isFluxAuthDebugEnabled()) {
        logFluxAuthDebug("session_validate_no_cookies", {
          supportRef,
          hasAccessCookie: false,
          hasRefreshCookie: false,
          requestHost: opts?.requestHostForDebug,
        });
      }
      return { result: { ok: false, supportRef, failureKind }, sideEffect: null };
    }

    const user = await getUserById(payload.id, payload.orgId);
    const validated = await userToValidate(user);
    if (!validated.ok) {
      logSessionValidateFail({
        reason: "user_not_found",
        userId: payload.id,
        orgId: payload.orgId,
        supportRef,
      });
      return { result: { ok: false, supportRef, failureKind: "user_not_found" }, sideEffect: { type: "clear_all" } };
    }
    return { result: validated, sideEffect: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[validateSessionFromCookieValues]", e);
    logSessionValidateFail({ reason: "uncaught_exception", supportRef, message: msg.slice(0, 500) });
    return { result: { ok: false, supportRef, failureKind: "unknown" }, sideEffect: null };
  }
}

/**
 * Valida access JWT ou renova via refresh (cookies httpOnly).
 */
export async function validateSessionFromCookies(): Promise<ValidateResult> {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  const refresh = store.get(REFRESH_COOKIE)?.value;
  let requestHostForDebug: string | undefined;
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-host");
    requestHostForDebug = forwarded?.split(",")[0]?.trim() || h.get("host") || undefined;
  } catch {
    /* no request context */
  }

  const { result, sideEffect } = await validateSessionFromCookieValues(access, refresh, {
    requestHostForDebug,
  });

  if (sideEffect?.type === "set_rotated") {
    await setAuthCookies(sideEffect.access, sideEffect.refreshPlain, sideEffect.persistent);
  } else if (sideEffect?.type === "clear_all") {
    await clearAuthCookies();
  }
  return result;
}

/**
 * Emite nova sessão (access + refresh) para outra organização em que o utilizador já participa.
 */
export async function switchSessionToOrg(
  userId: string,
  targetOrgId: string,
  remember = true
): Promise<ValidateResult> {
  const user = await getUserById(userId, targetOrgId.trim());
  if (!user) return { ok: false };
  const roles = deriveEffectiveRoles({
    id: user.id,
    isAdmin: user.id === "admin" || !!user.isAdmin,
    isExecutive: !!user.isExecutive,
    platformRole: user.platformRole,
    orgRole: user.orgRole,
  });
  await issueSessionForCredentials(
    {
      id: user.id,
      username: user.username,
      isAdmin: user.id === "admin" || !!user.isAdmin,
      ...(user.isExecutive ? { isExecutive: true } : {}),
      orgId: user.orgId,
      platformRole: roles.platformRole,
      orgRole: roles.orgRole,
    },
    remember
  );
  return userToValidate(user);
}
