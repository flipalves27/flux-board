import jwt from "jsonwebtoken";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { getJwtSecret } from "./jwt-secret";
import { ACCESS_COOKIE } from "./auth-cookie-names";
import { accessTokenExpiresSeconds } from "./session-ttl";

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
}): string {
  const secret = getJwtSecret();
  const expiresIn = accessTokenExpiresSeconds();
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      isAdmin: !!user.isAdmin,
      isExecutive: !!user.isExecutive,
      orgId: user.orgId ? String(user.orgId) : "org_default",
    },
    secret,
    { expiresIn }
  );
}

export function verifyToken(
  token: string
): { id: string; username: string; isAdmin: boolean; isExecutive: boolean; orgId: string } | null {
  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret) as {
      id: string;
      username: string;
      isAdmin: boolean;
      isExecutive?: boolean;
      orgId?: string;
    };
    return {
      id: payload.id,
      username: payload.username,
      isAdmin: !!payload.isAdmin,
      isExecutive: !!payload.isExecutive,
      orgId: payload.orgId ? String(payload.orgId) : "org_default",
    };
  } catch {
    return null;
  }
}

export function getAuthFromRequest(
  req: NextRequest
): { id: string; username: string; isAdmin: boolean; isExecutive: boolean; orgId: string } | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const payload = verifyToken(auth.slice(7));
    if (payload) return enrichAuthPayload(payload);
  }
  const cookieToken = req.cookies.get(ACCESS_COOKIE)?.value;
  if (cookieToken) {
    const payload = verifyToken(cookieToken);
    if (payload) return enrichAuthPayload(payload);
  }
  return null;
}

function enrichAuthPayload(payload: {
  id: string;
  username: string;
  isAdmin: boolean;
  isExecutive?: boolean;
  orgId: string;
}) {
  return {
    ...payload,
    isAdmin: !!payload.isAdmin,
    isExecutive: !!payload.isExecutive,
  };
}
