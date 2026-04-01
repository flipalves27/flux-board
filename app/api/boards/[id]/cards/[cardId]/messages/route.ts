import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { deriveEffectiveRoles } from "@/lib/rbac";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { FluxyMessageCreateSchema, zodErrorToMessage } from "@/lib/schemas";
import { createFluxyMessage, listFluxyMessages } from "@/lib/kv-fluxy-messages";
import { publishFluxyMessageCreated, subscribeFluxyCardMessages } from "@/lib/fluxy-message-stream";
import { finalizeFluxyMessageSideEffects } from "@/lib/fluxy-message-post";
import { buildFluxyMessageTargets } from "@/lib/fluxy-message-targets";
import { shouldRunFluxyCommandLlm } from "@/lib/fluxy-command-llm";
import { getOrganizationById } from "@/lib/kv-organizations";
import { rateLimit } from "@/lib/rate-limit";
import {
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  getEffectiveTier,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
} from "@/lib/plan-gates";
import { isTogetherApiConfigured } from "@/lib/org-ai-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; cardId: string }> };

function parseLimit(raw: string | null): number {
  const n = Number(raw ?? "");
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function streamEnabled(request: NextRequest): boolean {
  const url = new URL(request.url);
  return url.searchParams.get("stream") === "1";
}

function assertFluxyRole(payload: { id: string; isAdmin?: boolean; isExecutive?: boolean; orgRole?: string }): boolean {
  const role = deriveEffectiveRoles(payload).orgRole;
  return role === "gestor" || role === "membro" || role === "convidado";
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!assertFluxyRole(payload)) return NextResponse.json({ error: "Papel sem autorização" }, { status: 403 });

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  if (streamEnabled(request)) {
    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        send("ready", { boardId, cardId, t: Date.now() });
        unsubscribe = subscribeFluxyCardMessages(boardId, cardId, (evt) => send(evt.type, evt.payload));
        interval = setInterval(() => send("ping", { t: Date.now() }), 25000);
      },
      cancel() {
        if (interval) clearInterval(interval);
        if (unsubscribe) unsubscribe();
      },
    });
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor");
  const page = await listFluxyMessages({
    orgId: payload.orgId,
    boardId,
    conversationScope: "card",
    relatedCardId: cardId,
    limit,
    cursor,
  });
  return NextResponse.json(page);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!assertFluxyRole(payload)) return NextResponse.json({ error: "Papel sem autorização" }, { status: 403 });

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = FluxyMessageCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  if (parsed.data.conversationScope !== "card") {
    return NextResponse.json({ error: "Escopo inválido para este endpoint" }, { status: 400 });
  }

  const role = deriveEffectiveRoles(payload).orgRole;
  const mediatedByFluxy = parsed.data.mediatedByFluxy ?? false;
  const confirmFluxyNotify = parsed.data.confirmFluxyNotify === true;

  if (shouldRunFluxyCommandLlm(mediatedByFluxy, parsed.data.body)) {
    const rl = await rateLimit({
      key: `fluxy:cmd-llm:user:${payload.id}`,
      limit: 45,
      windowMs: 60 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Muitas mensagens com interpretação Fluxy. Tente novamente mais tarde." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const orgProbe = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxFromAuthPayload(payload);
    const tier = getEffectiveTier(orgProbe, gateCtx);
    const llmCloudEnabled =
      (Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL)) || Boolean(process.env.ANTHROPIC_API_KEY);
    if (tier === "free" && llmCloudEnabled) {
      const cap = getDailyAiCallsCap(orgProbe, gateCtx);
      if (cap !== null) {
        const rlDaily = await rateLimit({
          key: makeDailyAiCallsRateLimitKey(payload.orgId),
          limit: cap,
          windowMs: getDailyAiCallsWindowMs(),
        });
        if (!rlDaily.allowed) {
          return NextResponse.json(
            { error: "Limite diário de chamadas de IA atingido para a organização." },
            { status: 403 }
          );
        }
      }
    }
  }

  const org = await getOrganizationById(payload.orgId);
  const enriched = await buildFluxyMessageTargets({
    org,
    orgId: payload.orgId,
    userId: payload.id,
    isAdmin: payload.isAdmin,
    boardId,
    body: parsed.data.body,
    relatedCardId: cardId,
    contextCardId: null,
    clientMentions: parsed.data.mentions,
    mediatedByFluxy,
    confirmFluxyNotify,
  });

  if (enriched.needsNotifyConfirmation && enriched.notifyPreview) {
    return NextResponse.json(
      {
        error: "Confirmação necessária para notificar os destinatários inferidos pela Fluxy.",
        code: "FLUXY_NOTIFY_CONFIRM",
        notifyPreview: enriched.notifyPreview,
      },
      { status: 409 }
    );
  }

  const message = await createFluxyMessage({
    orgId: payload.orgId,
    boardId,
    body: parsed.data.body,
    conversationScope: "card",
    relatedCardId: cardId,
    participants: parsed.data.participants ?? [{ userId: payload.id, role }],
    mentions: enriched.mentions,
    targetUserIds: enriched.targetUserIds,
    createdBy: { userId: payload.id, role },
    mediatedByFluxy,
  });

  publishFluxyMessageCreated({
    boardId,
    relatedCardId: cardId,
    messageId: message.id,
    createdAt: message.createdAt,
  });

  await finalizeFluxyMessageSideEffects({
    orgId: payload.orgId,
    boardId,
    senderId: payload.id,
    message,
  });

  return NextResponse.json(
    {
      message,
      mentionMeta: { unresolvedTokens: enriched.unresolvedTokens },
      fluxyMeta: enriched.interpretationSource
        ? { interpretationSource: enriched.interpretationSource, intent: enriched.interpretation?.intent ?? null }
        : undefined,
    },
    { status: 201 }
  );
}
