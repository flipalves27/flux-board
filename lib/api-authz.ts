/**
 * Inventário RBAC (plano vs org vs plataforma)
 *
 * - Plano comercial: em `Organization` + `lib/plan-gates.ts` (`getEffectiveTier`, `assertFeatureAllowed`).
 *   Contexto `planGateCtxForAuth(isAdmin, isExecutive)` = admin/executivo **da organização** (não é admin global).
 * - Membros + billing: `ensureOrgTeamManager` = `platform_admin` OU gestor ativo (Equipe, escopo org).
 * - Demais gestão (branding, webhooks, convites, etc.): `ensureOrgManager` = `platform_admin` OU `org_manager`.
 * - Operações globais / multi-tenant na URL: só `ensurePlatformAdmin` ou `isSameOrgOrPlatformAdmin` em
 *   `lib/tenant-route-guard.ts` — nunca `payload.isAdmin` (flag de admin **da org**).
 * - Acesso a boards: `userCanAccessBoard(..., isAdmin)` usa o mesmo boolean do JWT: “vê todos os boards da org”;
 *   não concede acesso a outra organização.
 *
 * Rotas com `ensureOrgTeamManager`: usuários, equipe (`/api/team/members`), convites, billing (checkout/portal/etc.).
 * `ensureOrgManager`: org/webhooks*; organizations/verify-domain; boards export-template; `PUT /api/organizations/me`
 * (nome, slug, branding, IA) e demais gestão que não é só membros/billing.
 *
 * Plataforma: `/api/admin/rate-limit-abuse` → `ensurePlatformAdmin`.
 * Cross-org na URL: program-increments → `isSameOrgOrPlatformAdmin`.
 * Templates marketplace: bypass global → `isPlatformAdmin` (não org admin de outro tenant).
 */
import { NextResponse } from "next/server";
import { canManageOrganization, isPlatformAdmin } from "./rbac";
import type { getAuthFromRequest } from "./auth";
import type { FeatureKey, PlanGateError } from "./plan-gates";

type AuthPayload = NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>;

export function deny(message = "Acesso negado", status = 403) {
  return NextResponse.json({ error: message }, { status });
}

export function denyPlan(error: PlanGateError) {
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      feature: error.feature,
      requiredTiers: error.requiredTiers,
      currentTier: error.currentTier,
    },
    { status: error.status }
  );
}

export function denyUpgradeRequired(feature: FeatureKey, status = 402) {
  return NextResponse.json(
    {
      error: "Upgrade de plano necessário para acessar este recurso.",
      code: "PLAN_UPGRADE_REQUIRED",
      feature,
    },
    { status }
  );
}

export function ensurePlatformAdmin(payload: AuthPayload): NextResponse | null {
  return isPlatformAdmin(payload) ? null : deny("Acesso negado. Apenas administrador da plataforma.");
}

export function ensureOrgManager(payload: AuthPayload): NextResponse | null {
  return canManageOrganization(payload)
    ? null
    : deny("Acesso negado. Apenas administrador ou executivo da organização.");
}

export function ensureOrgTeamManager(payload: AuthPayload): NextResponse | null {
  if (isPlatformAdmin(payload)) return null;
  if (payload.isOrgTeamManager) return null;
  return deny("Acesso negado. Apenas gestores (Equipe) podem gerenciar membros e billing.");
}
