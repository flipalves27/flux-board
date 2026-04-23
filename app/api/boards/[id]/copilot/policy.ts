import { NextResponse } from "next/server";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  canUseFeature,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  getEffectiveTier,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import { isOrgCloudLlmConfigured } from "@/lib/org-ai-routing";
import { getBoardCopilotChat } from "@/lib/kv-board-copilot";
import type { CopilotAuthPayload, CopilotChatHistory } from "./types";
import { COPILOT_USER_RATE_LIMIT, FREE_DEMO_MESSAGES_LIMIT } from "./config";

export async function enforceCopilotGetPolicy(input: {
  payload: CopilotAuthPayload;
  boardId: string;
}):
  Promise<
    | {
        ok: true;
        data: {
          org: Record<string, unknown>;
          gateCtx: Record<string, unknown>;
          tier: string;
          chat: CopilotChatHistory;
        };
      }
    | { ok: false; response: NextResponse }
  > {
  const { payload, boardId } = input;
  const org = await getOrganizationById(payload.orgId);
  if (!org) return { ok: false, response: NextResponse.json({ error: "Org não encontrada" }, { status: 404 }) };

  const gateCtx = planGateCtxFromAuthPayload(payload as never);
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return { ok: false, response: NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 }) };
  }

  const tier = getEffectiveTier(org, gateCtx);
  const chat = await getBoardCopilotChat({ orgId: payload.orgId, boardId, userId: payload.id });
  return { ok: true, data: { org: org as never, gateCtx: gateCtx as never, tier, chat } };
}

export async function enforceCopilotPostPolicy(input: {
  payload: CopilotAuthPayload;
  boardId: string;
}):
  Promise<
    | {
        ok: true;
        data: {
          org: Record<string, unknown>;
          gateCtx: Record<string, unknown>;
          tier: string;
          board: Record<string, unknown>;
          chat: CopilotChatHistory;
        };
      }
    | { ok: false; response: NextResponse }
  > {
  const { payload, boardId } = input;
  const org = await getOrganizationById(payload.orgId);
  if (!org) return { ok: false, response: NextResponse.json({ error: "Org não encontrada" }, { status: 404 }) };

  const gateCtx = planGateCtxFromAuthPayload(payload as never);

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return { ok: false, response: NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 }) };
  }

  const tier = getEffectiveTier(org, gateCtx);
  if (tier !== "free" && !canUseFeature(org, "board_copilot", gateCtx)) {
    return { ok: false, response: NextResponse.json({ error: "Recurso disponível apenas para Pro/Business." }, { status: 403 }) };
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return { ok: false, response: NextResponse.json({ error: "Board não encontrado" }, { status: 404 }) };

  const chat = await getBoardCopilotChat({ orgId: payload.orgId, boardId, userId: payload.id });
  if (tier === "free" && chat.freeDemoUsed >= FREE_DEMO_MESSAGES_LIMIT) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Modo demo atingiu o limite. Faça upgrade para Pro/Business para continuar." },
        { status: 403 }
      ),
    };
  }

  const rl = await rateLimit({
    key: `boards:copilot:user:${payload.id}`,
    limit: COPILOT_USER_RATE_LIMIT.limit,
    windowMs: COPILOT_USER_RATE_LIMIT.windowMs,
  });
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Muitas requisições. Tente novamente mais tarde." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      ),
    };
  }

  const llmCloudEnabled = isOrgCloudLlmConfigured(org);
  if (tier === "free" && llmCloudEnabled) {
    const cap = getDailyAiCallsCap(org, gateCtx);
    if (cap !== null) {
      const rlDaily = await rateLimit({
        key: makeDailyAiCallsRateLimitKey(payload.orgId),
        limit: cap,
        windowMs: getDailyAiCallsWindowMs(),
      });
      if (!rlDaily.allowed) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Limite diário de chamadas de IA atingido. Faça upgrade no Stripe." },
            { status: 403 }
          ),
        };
      }
    }
  }

  return { ok: true, data: { org: org as never, gateCtx: gateCtx as never, tier, board: board as never, chat } };
}

