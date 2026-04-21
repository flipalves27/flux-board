import "server-only";

import type { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById, type Organization } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  getEffectiveTier,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
  PlanGateError,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import type { BoardData } from "@/lib/kv-boards";

export type SpecPlanAuthPayload = NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>;

export type SpecPlanAccessOk = {
  payload: SpecPlanAuthPayload;
  org: Organization;
  board: BoardData;
  boardId: string;
  gateCtx: ReturnType<typeof planGateCtxFromAuthPayload>;
  tier: ReturnType<typeof getEffectiveTier>;
};

export async function ensureSpecPlanAccess(
  request: NextRequest,
  boardId: string,
  opts?: { consumeAnalysisQuota?: boolean }
): Promise<Response | SpecPlanAccessOk> {
  const consumeAnalysisQuota = Boolean(opts?.consumeAnalysisQuota);

  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401 });
  }

  if (!boardId || boardId === "boards") {
    return new Response(JSON.stringify({ error: "ID do board é obrigatório" }), { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  if (!org) {
    return new Response(JSON.stringify({ error: "Org não encontrada" }), { status: 404 });
  }

  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "spec_ai_scope_planner", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      return new Response(
        JSON.stringify({
          error: err.message,
          code: err.code,
          feature: err.feature,
          requiredTiers: err.requiredTiers,
        }),
        { status: err.status }
      );
    }
    throw err;
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return new Response(JSON.stringify({ error: "Sem permissão para este board" }), { status: 403 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return new Response(JSON.stringify({ error: "Board não encontrado" }), { status: 404 });
  }

  const tier = getEffectiveTier(org, gateCtx);

  if (consumeAnalysisQuota) {
    const rl = await rateLimit({
      key: `boards:spec-plan:user:${payload.id}`,
      limit: 8,
      windowMs: 60 * 60 * 1000,
    });
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Muitas análises. Tente novamente mais tarde." }), {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      });
    }

    const llmCloudEnabled =
      (Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL)) ||
      Boolean(process.env.ANTHROPIC_API_KEY);
    if (tier === "free" && llmCloudEnabled) {
      const cap = getDailyAiCallsCap(org, gateCtx);
      if (cap !== null) {
        const dailyKey = makeDailyAiCallsRateLimitKey(payload.orgId);
        const rlDaily = await rateLimit({
          key: dailyKey,
          limit: cap,
          windowMs: getDailyAiCallsWindowMs(),
        });
        if (!rlDaily.allowed) {
          return new Response(JSON.stringify({ error: "Limite diário de chamadas de IA atingido." }), { status: 403 });
        }
      }
    }
  }

  return { payload, org, board, boardId, gateCtx, tier };
}
