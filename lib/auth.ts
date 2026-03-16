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

export function createToken(user: { id: string; username: string; isAdmin?: boolean }): string {
  return jwt.sign(
    { id: user.id, username: user.username, isAdmin: !!user.isAdmin },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): { id: string; username: string; isAdmin: boolean } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; username: string; isAdmin: boolean };
  } catch {
    return null;
  }
}

export function getAuthFromRequest(req: NextRequest): { id: string; username: string; isAdmin: boolean } | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const payload = verifyToken(auth.slice(7));
  if (!payload) return null;
  return {
    ...payload,
    isAdmin: payload.id === "admin" || payload.isAdmin,
  };
}
