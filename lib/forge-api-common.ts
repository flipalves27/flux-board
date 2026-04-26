import { NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError, type FeatureKey } from "@/lib/plan-gates";
import type { ForgeTier } from "@/lib/forge-types";

export type ForgeAuthedContext = {
  payload: NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>;
  org: NonNullable<Awaited<ReturnType<typeof getOrganizationById>>>;
};

export async function requireForgeAuth(request: Request): Promise<ForgeAuthedContext | Response> {
  const payload = await getAuthFromRequest(request as Parameters<typeof getAuthFromRequest>[0]);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const org = await getOrganizationById(payload.orgId);
  if (!org) {
    return NextResponse.json({ error: "Org não encontrada" }, { status: 404 });
  }
  return { payload, org };
}

export function featureKeyForTier(tier: ForgeTier): FeatureKey {
  if (tier === "tested") return "forge_tested";
  if (tier === "autonomous") return "forge_autonomous";
  return "forge_oneshot";
}

export function assertForgeTierAllowed(
  org: ForgeAuthedContext["org"],
  tier: ForgeTier,
  gateCtx: ReturnType<typeof planGateCtxFromAuthPayload>
): void {
  assertFeatureAllowed(org, featureKeyForTier(tier), gateCtx);
}

export function jsonPlanGate(err: unknown): Response | null {
  if (err instanceof PlanGateError) {
    return NextResponse.json(
      { error: err.message, code: err.code, feature: err.feature, requiredTiers: err.requiredTiers },
      { status: err.status }
    );
  }
  return null;
}
