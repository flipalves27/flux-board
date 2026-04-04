import jwt from "jsonwebtoken";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { getJwtSecret } from "./jwt-secret";
import { ACCESS_COOKIE } from "./auth-cookie-names";
import { accessTokenExpiresSeconds } from "./session-ttl";
import {
  canManageOrganization,
  deriveEffectiveRoles,
  seesAllBoardsInOrg,
  type OrgMembershipRole,
  type OrgRole,
  type PlatformRole,
} from "./rbac";
import { getUserById } from "./kv-users";
import { isFluxAuthDebugEnabled, logFluxAuthDebug } from "./flux-auth-debug";

const SALT_LEN = 16;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
}

export function createToken(user: {
  id: string;
  username: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  orgId?: string;
  platformRole?: PlatformRole;
  orgRole?: OrgRole;
}): string {
  const roles = deriveEffectiveRoles(user);
  const seesAll = seesAllBoardsInOrg(roles);
  const secret = getJwtSecret();
  const expiresIn = accessTokenExpiresSeconds();
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      /** Compat: mesmo critério que `seesAllBoardsInOrg` (gestor ou admin do domínio). */
      isAdmin: seesAll,
      isExecutive: !!user.isExecutive,
      orgId: user.orgId ? String(user.orgId) : "org_default",
      platformRole: roles.platformRole,
      orgRole: roles.orgRole,
    },
    secret,
    { expiresIn, algorithm: "HS256" }
  );
}

export function verifyToken(
  token: string
): {
  id: string;
  username: string;
  isAdmin: boolean;
  isExecutive: boolean;
  orgId: string;
  platformRole: PlatformRole;
  orgRole: OrgMembershipRole;
} | null {
  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as {
      id: string;
      username: string;
      isAdmin: boolean;
      isExecutive?: boolean;
      orgId?: string;
      platformRole?: PlatformRole;
      orgRole?: OrgRole;
    };
    const roles = deriveEffectiveRoles(payload);
    const seesAll = seesAllBoardsInOrg(roles);
    return {
      id: payload.id,
      username: payload.username,
      isAdmin: seesAll,
      isExecutive: !!payload.isExecutive,
      orgId: payload.orgId ? String(payload.orgId) : "org_default",
      platformRole: roles.platformRole,
      orgRole: roles.orgRole,
    };
  } catch {
    return null;
  }
}

/**
 * Autenticação para rotas API: valida JWT e **recarrega papel (admin/executivo) do banco**,
 * para que mudanças feitas em Usuários passem a valer sem novo login.
 */
export async function getAuthFromRequest(
  req: NextRequest
): Promise<{
  id: string;
  username: string;
  /** @deprecated Preferir `seesAllBoardsInOrg` — vê todos os boards da org ou admin do domínio. */
  isAdmin: boolean;
  isExecutive: boolean;
  orgId: string;
  platformRole: PlatformRole;
  orgRole: OrgMembershipRole;
  seesAllBoardsInOrg: boolean;
  /** @deprecated Alinhado a gestão da org (`gestor` ou `platform_admin`). */
  isOrgTeamManager: boolean;
} | null> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  let token: string | null = null;
  if (auth?.startsWith("Bearer ")) token = auth.slice(7);
  if (!token) token = req.cookies.get(ACCESS_COOKIE)?.value ?? null;
  if (!token) {
    if (isFluxAuthDebugEnabled()) {
      const forwarded = req.headers.get("x-forwarded-host");
      const host = forwarded?.split(",")[0]?.trim() || req.headers.get("host") || undefined;
      logFluxAuthDebug("api_auth_no_access_token", {
        pathname: req.nextUrl.pathname,
        host,
        cookieHeaderPresent: req.headers.has("cookie"),
      });
    }
    return null;
  }
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = await getUserById(payload.id, payload.orgId);
  if (!user) return null;
  const roles = deriveEffectiveRoles({
    id: user.id,
    isAdmin: user.id === "admin" || !!user.isAdmin,
    isExecutive: !!user.isExecutive,
    platformRole: user.platformRole,
    orgRole: user.orgRole,
  });
  const sees = seesAllBoardsInOrg(roles);
  const canManageOrg = canManageOrganization(roles);
  return {
    id: user.id,
    username: user.username,
    isAdmin: sees,
    isExecutive: !!user.isExecutive,
    orgId: user.orgId,
    platformRole: roles.platformRole,
    orgRole: roles.orgRole,
    seesAllBoardsInOrg: sees,
    isOrgTeamManager: canManageOrg,
  };
}
