import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { resolveOnda4Flags } from "@/lib/onda4-flags";
import { resolveUxV2Flags } from "@/lib/ux-v2-flags";
import { publicApiErrorResponse } from "@/lib/public-api-error";

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
    const gateCtx = planGateCtxFromAuthPayload(payload);

    const onda4 = resolveOnda4Flags(org);
    const uxV2 = resolveUxV2Flags(org);

    return NextResponse.json({
      lss_executive_reports: canUseFeature(org, "lss_executive_reports", gateCtx),
      lss_ai_premium: canUseFeature(org, "lss_ai_premium", gateCtx),
      safe_ai_premium: canUseFeature(org, "safe_ai_premium", gateCtx),
      board_copilot: canUseFeature(org, "board_copilot", gateCtx),
      spec_ai_scope_planner: canUseFeature(org, "spec_ai_scope_planner", gateCtx),
      board_pdf_list_import: canUseFeature(org, "board_pdf_list_import", gateCtx),
      flux_docs: canUseFeature(org, "flux_docs", gateCtx),
      flux_docs_rag: canUseFeature(org, "flux_docs_rag", gateCtx),
      forge_oneshot: canUseFeature(org, "forge_oneshot", gateCtx),
      forge_tested: canUseFeature(org, "forge_tested", gateCtx),
      forge_autonomous: canUseFeature(org, "forge_autonomous", gateCtx),
      ux_v2_command_unified: uxV2.ux_v2_command_unified,
      ux_v2_workbar: uxV2.ux_v2_workbar,
      ux_v2_toolbar: uxV2.ux_v2_toolbar,
      ux_v2_card_modal_v2: uxV2.ux_v2_card_modal_v2,
      /** Rollout Onda 4 — espelha `Organization.ui.onda4` + defaults de ambiente. */
      ui: { onda4, uxV2 },
    });
  } catch (err) {
    console.error("org/features error:", err);
    return publicApiErrorResponse(err, { context: "api/org/features/route.ts" });
  }
}
