"use server";

import { verifyPassword, createToken, hashPassword, verifyToken } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getUserByUsername,
  getUserByEmail,
  getUserById,
  ensureAdminUser,
  createUser,
} from "@/lib/kv-users";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

export type AuthResult =
  | { ok: true; token: string; user: { id: string; username: string; name: string; email: string; isAdmin: boolean } }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Server Action para login. Executa no servidor, evitando 403 da Vercel
 * Deployment Protection (que bloqueia requisições POST do cliente).
 */
export async function loginAction(
  username: string,
  password: string
): Promise<AuthResult> {
  try {
    // In Next.js 15 the `headers()` type can be `Promise<ReadonlyHeaders>` in some contexts.
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
    const user = ident.includes("@")
      ? await getUserByEmail(ident)
      : await getUserByUsername(ident);

    if (!user || !verifyPassword(password, user.passwordHash || "")) {
      return { ok: false, error: "Usuário ou senha inválidos" };
    }

    const isAdmin = user.id === "admin" || !!user.isAdmin;
    const token = createToken({ ...user, isAdmin });
    return {
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin,
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
  password: string
): Promise<AuthResult> {
  try {
    // In Next.js 15 the `headers()` type can be `Promise<ReadonlyHeaders>` in some contexts.
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

    await ensureAdminUser();
    const emailNorm = (email || "").trim().toLowerCase();
    const nameTrim = (name || "").trim().slice(0, 100);

    if (password.length < 4) {
      return { ok: false, error: "Senha deve ter pelo menos 4 caracteres." };
    }

    const existing = await getUserByEmail(emailNorm);
    if (existing) {
      return { ok: false, error: "E-mail já cadastrado." };
    }

    const user = await createUser({
      username: emailNorm,
      name: nameTrim || emailNorm,
      email: emailNorm,
      passwordHash: hashPassword(password),
    });

    const token = createToken(user);
    return {
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin: false,
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

export type ValidateResult =
  | { ok: true; user: { id: string; username: string; name: string; email: string; isAdmin: boolean } }
  | { ok: false };

/**
 * Server Action para validar token. Evita 403 da Vercel Protection ao
 * validar sessão sem chamar /api/auth/me.
 */
export async function validateTokenAction(token: string): Promise<ValidateResult> {
  try {
    const payload = verifyToken(token);
    if (!payload) return { ok: false };
    const user = await getUserById(payload.id);
    if (!user) return { ok: false };
    const isAdmin = user.id === "admin" || !!user.isAdmin;
    return {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin,
      },
    };
  } catch {
    return { ok: false };
  }
}
