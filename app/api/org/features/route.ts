import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature, planGateCtxForAuth } from "@/lib/plan-gates";

/**
 * Sinaliza recursos do plano para a UI (sem expor matriz completa).
 */
export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxForAuth(payload.isAdmin, payload.isExecutive);

    return NextResponse.json({
      lss_executive_reports: canUseFeature(org, "lss_executive_reports", gateCtx),
      lss_ai_premium: canUseFeature(org, "lss_ai_premium", gateCtx),
      board_copilot: canUseFeature(org, "board_copilot", gateCtx),
    });
  } catch (err) {
    console.error("org/features error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
