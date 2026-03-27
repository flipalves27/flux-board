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
  return canManageOrganization(payload) ? null : deny("Acesso negado. Apenas gestor da organização.");
}
