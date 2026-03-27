import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  makeDailyAiCallsRateLimitKey,
  planGateCtxForAuth,
  PlanGateError,
  getDailyAiCallsWindowMs,
} from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { rateLimit } from "@/lib/rate-limit";
import { generateFluxReportExplain } from "@/lib/flux-reports-explain";

const BodySchema = z.object({
  chartId: z.string().trim().min(1).max(120),
  chartTitle: z.string().trim().min(1).max(200),
  dataSummary: z.string().trim().min(1).max(14_000),
});

/**
 * Narrativa executiva (IA) para um gráfico do Flux Reports.
 */
export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxForAuth(payload.isAdmin, payload.isExecutive);
    try {
      assertFeatureAllowed(org, "portfolio_export", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }

    const json = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }
    const { chartId, chartTitle, dataSummary } = parsed.data;

    const cap = getDailyAiCallsCap(org, gateCtx);
    const togetherEnabled = Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL);
    if (cap !== null && togetherEnabled) {
      const dailyKey = makeDailyAiCallsRateLimitKey(payload.orgId);
      const rlDaily = await rateLimit({
        key: dailyKey,
        limit: cap,
        windowMs: getDailyAiCallsWindowMs(),
      });
      if (!rlDaily.allowed) {
        return NextResponse.json(
          { error: "Limite diário de chamadas de IA atingido. Faça upgrade no Stripe." },
          { status: 403 }
        );
      }
    }

    const result = await generateFluxReportExplain({ chartId, chartTitle, dataSummary });

    return NextResponse.json({
      narrative: result.narrative,
      generatedWithAI: result.generatedWithAI,
      model: result.model,
      provider: result.provider,
      errorKind: result.errorKind,
      errorMessage: result.errorMessage,
    });
  } catch (err) {
    console.error("Flux reports explain API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
