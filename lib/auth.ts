import jwt from "jsonwebtoken";
import crypto from "crypto";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET || "seguradora-reborn-secret-change-in-production";
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

export function createToken(user: { id: string; username: string; isAdmin?: boolean; orgId?: string }): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      isAdmin: !!user.isAdmin,
      // Mantemos fallback para tokens antigos (antes da migração do orgId).
      orgId: user.orgId ? String(user.orgId) : "org_default",
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(
  token: string
): { id: string; username: string; isAdmin: boolean; orgId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; username: string; isAdmin: boolean; orgId?: string };
    return {
      id: payload.id,
      username: payload.username,
      isAdmin: !!payload.isAdmin,
      orgId: payload.orgId ? String(payload.orgId) : "org_default",
    };
  } catch {
    return null;
  }
}

export function getAuthFromRequest(
  req: NextRequest
): { id: string; username: string; isAdmin: boolean; orgId: string } | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const payload = verifyToken(auth.slice(7));
  if (!payload) return null;
  return {
    ...payload,
    // `isAdmin` aqui já deve ser escopo do tenant (org-admin).
    isAdmin: !!payload.isAdmin,
  };
}
