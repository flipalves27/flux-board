import jwt from "jsonwebtoken";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { getJwtSecret } from "./jwt-secret";
import { ACCESS_COOKIE } from "./auth-cookie-names";
import { accessTokenExpiresSeconds } from "./session-ttl";
import { deriveEffectiveRoles, type OrgRole, type PlatformRole } from "./rbac";

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
  const secret = getJwtSecret();
  const expiresIn = accessTokenExpiresSeconds();
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      isAdmin: !!user.isAdmin,
      isExecutive: !!user.isExecutive,
      orgId: user.orgId ? String(user.orgId) : "org_default",
      platformRole: roles.platformRole,
      orgRole: roles.orgRole,
    },
    secret,
    { expiresIn }
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
  orgRole: OrgRole;
} | null {
  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret) as {
      id: string;
      username: string;
      isAdmin: boolean;
      isExecutive?: boolean;
      orgId?: string;
      platformRole?: PlatformRole;
      orgRole?: OrgRole;
    };
    const roles = deriveEffectiveRoles(payload);
    return {
      id: payload.id,
      username: payload.username,
      isAdmin: !!payload.isAdmin,
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
  isAdmin: boolean;
  isExecutive: boolean;
  orgId: string;
  platformRole: PlatformRole;
  orgRole: OrgRole;
  isOrgTeamManager: boolean;
} | null> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  let token: string | null = null;
  if (auth?.startsWith("Bearer ")) token = auth.slice(7);
  if (!token) token = req.cookies.get(ACCESS_COOKIE)?.value ?? null;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const { getUserById } = await import("./kv-users");
  const user = await getUserById(payload.id, payload.orgId);
  if (!user) return null;
  const roles = deriveEffectiveRoles({
    id: user.id,
    isAdmin: user.id === "admin" || !!user.isAdmin,
    isExecutive: !!user.isExecutive,
    platformRole: user.platformRole,
    orgRole: user.orgRole,
  });
  const { userIsActiveOrgTeamManager } = await import("./org-team-gestor");
  const isOrgTeamManager = await userIsActiveOrgTeamManager(user.orgId, user.id);
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.id === "admin" || !!user.isAdmin,
    isExecutive: !!user.isExecutive,
    orgId: user.orgId,
    platformRole: roles.platformRole,
    orgRole: roles.orgRole,
    isOrgTeamManager,
  };
}
