import "server-only";

import { cookies } from "next/headers";
import { ACCESS_COOKIE } from "./auth-cookie-names";
import { verifyToken } from "./auth";
import type { AuthUser } from "@/context/auth-context";
import {
  canManageOrganization,
  deriveEffectiveRoles,
  seesAllBoardsInOrg,
} from "./rbac";

/**
 * Lê o access JWT dos cookies e extrai dados do utilizador *sem* round-trip ao banco.
 *
 * Usado pelo `RootLayout` (Server Component) para hidratar o `AuthProvider` imediatamente,
 * eliminando o "Confirmando a sessão…" no onboarding após OAuth.
 *
 * Só funciona com tokens emitidos após esta migração (que incluem `name` e `email`).
 * Tokens legados (sem esses campos) retornam `null` → `AuthProvider` cai no fluxo normal.
 *
 * A validação completa com banco ainda acontece em background via `GET /api/auth/session`.
 */
export async function getBootstrapSessionUser(): Promise<AuthUser | null> {
  try {
    const store = await cookies();
    const access = store.get(ACCESS_COOKIE)?.value;
    if (!access) return null;

    const payload = verifyToken(access);
    if (!payload) return null;

    // Tokens legados não têm name/email — não podemos montar um AuthUser completo.
    if (!payload.name || !payload.email) return null;

    const roles = deriveEffectiveRoles({
      id: payload.id,
      isAdmin: payload.isAdmin,
      isExecutive: payload.isExecutive,
      platformRole: payload.platformRole,
      orgRole: payload.orgRole,
    });
    const sees = seesAllBoardsInOrg(roles);
    const canManage = canManageOrganization(roles);

    return {
      id: payload.id,
      username: payload.username,
      name: payload.name,
      email: payload.email,
      isAdmin: sees,
      seesAllBoardsInOrg: sees,
      ...(payload.isExecutive ? { isExecutive: true } : {}),
      orgId: payload.orgId,
      platformRole: roles.platformRole,
      orgRole: roles.orgRole,
      ...(canManage ? { isOrgTeamManager: true } : {}),
    };
  } catch {
    return null;
  }
}
