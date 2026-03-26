"use server";

import { verifyPassword, hashPassword } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getUserByUsername,
  getUserByEmail,
  ensureAdminUser,
  createUser,
  listUsers,
  deleteUser,
} from "@/lib/kv-users";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import {
  createTrialOrganizationForSignup,
  updateOrganizationOwner,
  getOrganizationById,
} from "@/lib/kv-organizations";
import { consumeOrganizationInvite, validateOrganizationInvite } from "@/lib/kv-organization-invites";
import { getUserCap } from "@/lib/plan-gates";
import type { ThemePreference } from "@/lib/theme-storage";
import { issueSessionForCredentials, validateSessionFromCookies } from "@/lib/server-session";
import type { ValidateResult } from "@/lib/auth-types";

export type { ValidateResult } from "@/lib/auth-types";

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
        themePreference?: ThemePreference;
        boardProductTourCompleted?: boolean;
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
  remember = true
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
    const user = ident.includes("@")
      ? await getUserByEmail(ident)
      : await getUserByUsername(ident);

    if (!user || !verifyPassword(password, user.passwordHash || "")) {
      return { ok: false, error: "Usuário ou senha inválidos" };
    }

    const isAdmin = user.id === "admin" || !!user.isAdmin;
    const isExecutive = !!user.isExecutive;
    await issueSessionForCredentials(
      {
        id: user.id,
        username: user.username,
        isAdmin,
        ...(isExecutive ? { isExecutive: true } : {}),
        orgId: user.orgId,
      },
      remember
    );
    return {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin,
        ...(isExecutive ? { isExecutive: true } : {}),
        orgId: user.orgId,
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

    if (password.length < 4) {
      return { ok: false, error: "Senha deve ter pelo menos 4 caracteres." };
    }

    await ensureAdminUser();

    const existing = await getUserByEmail(emailNorm);
    if (existing) {
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

      const user = await createUser({
        username: emailNorm,
        name: nameTrim || emailNorm,
        email: emailNorm,
        passwordHash: hashPassword(password),
        orgId: validated.orgId,
        isAdmin: false,
      });

      const ok = await consumeOrganizationInvite({ code: inviteCode, email: emailNorm, userId: user.id });
      if (!ok) {
        await deleteUser(user.id, validated.orgId);
        return { ok: false, error: "Convite já foi utilizado." };
      }

      await issueSessionForCredentials(
        {
          id: user.id,
          username: user.username,
          isAdmin: false,
          orgId: user.orgId,
        },
        remember
      );
      return {
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          isAdmin: false,
          orgId: user.orgId,
          ...(user.themePreference ? { themePreference: user.themePreference } : {}),
          ...(user.boardProductTourCompleted ? { boardProductTourCompleted: true } : {}),
        },
      };
    }

    const orgOwnerPlaceholder = `pending_${Date.now()}`;
    const org = await createTrialOrganizationForSignup(orgOwnerPlaceholder, emailNorm);

    const user = await createUser({
      username: emailNorm,
      name: nameTrim || emailNorm,
      email: emailNorm,
      passwordHash: hashPassword(password),
      orgId: org._id,
      isAdmin: true,
    });

    await updateOrganizationOwner(org._id, user.id);

    await issueSessionForCredentials(
      {
        id: user.id,
        username: user.username,
        isAdmin: true,
        orgId: user.orgId,
      },
      remember
    );
    return {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin: true,
        orgId: user.orgId,
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
 */
export async function validateSessionAction(): Promise<ValidateResult> {
  try {
    return await validateSessionFromCookies();
  } catch {
    return { ok: false };
  }
}
