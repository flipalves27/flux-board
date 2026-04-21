import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  heuristicCardContextFromTranscript,
  llmVoiceTranscriptCardContext,
  type LlmCardContextResult,
} from "@/lib/card-context-llm";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { CardVoiceDraftInputSchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
  PlanGateError,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import { isAnthropicApiConfigured } from "@/lib/org-ai-routing";
import { includeLlmTelemetryInApiResponse } from "@/lib/rbac";

type AuthPayload = NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>;

function voiceDraftJsonResponse(payload: AuthPayload, body: Record<string, unknown>) {
  if (!includeLlmTelemetryInApiResponse(payload)) {
    const { provider: _pr, model: _mo, llmDebug: _dbg, ...rest } = body;
    return NextResponse.json(rest);
  }
  return NextResponse.json(body);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  const boardId = requestedBoardId;

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  let planBlocksAiContext = false;
  try {
    assertFeatureAllowed(org, "card_context", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      planBlocksAiContext = true;
    } else {
      throw err;
    }
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const rl = await rateLimit({
    key: `boards:card-voice-draft:user:${payload.id}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    console.warn("[rate-limit] blocked card-voice-draft", { userId: payload.id, retryAfterSeconds: rl.retryAfterSeconds });
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente mais tarde." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  try {
    const body = await request.json();
    const parsed = CardVoiceDraftInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const transcript = guardUserPromptForLlm(sanitizeText(parsed.data.transcript).trim()).text;
    if (!transcript) {
      return NextResponse.json({ error: "Transcrição é obrigatória." }, { status: 400 });
    }

    const board = await getBoard(boardId, payload.orgId);
    const boardName = board?.name || "Board";
    const startedAt = Date.now();

    if (planBlocksAiContext) {
      const fallback = heuristicCardContextFromTranscript(transcript);
      const result: LlmCardContextResult = {
        ...fallback,
        generatedWithAI: false,
        provider: "together.ai",
        errorKind: "plan_blocked",
        errorMessage: "Plano atual sem acesso ao recurso de IA completo. Aplicado fallback estruturado.",
      };
      return voiceDraftJsonResponse(payload, {
        ok: true,
        titulo: result.titulo,
        descricao: result.descricao,
        resumoNegocio: result.resumoNegocio,
        objetivo: result.objetivo,
        generatedWithAI: false,
        provider: result.provider,
        model: result.model,
        llmDebug: {
          source: "heuristic",
          generatedWithAI: false,
          provider: result.provider,
          model: result.model,
          errorKind: result.errorKind,
          errorMessage: result.errorMessage,
          cacheHit: false,
          durationMs: Date.now() - startedAt,
        },
      });
    }

    const cap = getDailyAiCallsCap(org, gateCtx);
    const cloudAiEnabled =
      isAnthropicApiConfigured() || Boolean(process.env.TOGETHER_API_KEY?.trim());
    if (cap !== null && cloudAiEnabled) {
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

    const result = await llmVoiceTranscriptCardContext({
      boardName,
      transcript,
      org,
      orgId: payload.orgId,
      userId: payload.id,
      isAdmin: payload.isAdmin,
    });
    const debugSource = result.generatedWithAI ? "ai" : "heuristic";

    return voiceDraftJsonResponse(payload, {
      ok: true,
      titulo: result.titulo,
      descricao: result.descricao,
      resumoNegocio: result.resumoNegocio,
      objetivo: result.objetivo,
      generatedWithAI: result.generatedWithAI,
      provider: result.provider,
      model: result.model,
      llmDebug: {
        source: debugSource,
        generatedWithAI: result.generatedWithAI,
        provider: result.provider,
        model: result.model,
        errorKind: result.errorKind,
        errorMessage: result.errorMessage,
        cacheHit: false,
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (err) {
    return publicApiErrorResponse(err, { context: "api/boards/[id]/card-voice-draft/route.ts" });
  }
}
