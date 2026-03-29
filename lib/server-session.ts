import "server-only";

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { createToken, verifyToken } from "./auth";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./auth-cookie-names";
import { setAuthCookies } from "./session-cookies";
import { createRefreshSession, consumeRefreshSessionForRotation } from "./kv-refresh-sessions";
import { refreshRecordExpiresAt } from "./session-ttl";
import { getUserById } from "./kv-users";
import type { ThemePreference } from "./theme-storage";
import type { ValidateResult } from "./auth-types";
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
  await setAuthCookies(access, plain, remember);
}

/**
 * Valida refresh opaco, revoga o token anterior e emite par access+refresh.
 * Usado pela rota POST /api/auth/refresh e por validateSessionFromCookies.
 */
export async function rotateSessionFromRefreshPlain(refreshPlain: string): Promise<{
  access: string;
  refreshPlain: string;
  persistent: boolean;
  user: User;
} | null> {
  const rotated = await consumeRefreshSessionForRotation(refreshPlain);
  if (!rotated) return null;
  const persistent = rotated.persistent ?? true;
  const user = await getUserById(rotated.userId, rotated.orgId);
  if (!user) return null;
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
    familyId: rotated.familyId,
    persistent,
    expiresAt,
  });
  return { access: accessNew, refreshPlain: plain, persistent, user };
}

/**
 * Valida access JWT ou renova via refresh (cookies httpOnly).
 */
export async function validateSessionFromCookies(): Promise<ValidateResult> {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  const refresh = store.get(REFRESH_COOKIE)?.value;

  const payload = access ? verifyToken(access) : null;

  if (!payload && refresh) {
    const rotated = await rotateSessionFromRefreshPlain(refresh);
    if (rotated) {
      await setAuthCookies(rotated.access, rotated.refreshPlain, rotated.persistent);
      return userToValidate(rotated.user);
    }
  }

  if (!payload) return { ok: false };
  const user = await getUserById(payload.id, payload.orgId);
  return userToValidate(user);
}
