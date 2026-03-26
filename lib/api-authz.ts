import { NextResponse } from "next/server";
import { canManageOrganization, isPlatformAdmin } from "./rbac";
import type { getAuthFromRequest } from "./auth";

type AuthPayload = NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>;

export function deny(message = "Acesso negado", status = 403) {
  return NextResponse.json({ error: message }, { status });
}

export function ensurePlatformAdmin(payload: AuthPayload): NextResponse | null {
  return isPlatformAdmin(payload) ? null : deny("Acesso negado. Apenas administrador da plataforma.");
}

export function ensureOrgManager(payload: AuthPayload): NextResponse | null {
  return canManageOrganization(payload) ? null : deny("Acesso negado. Apenas gestor da organização.");
}
