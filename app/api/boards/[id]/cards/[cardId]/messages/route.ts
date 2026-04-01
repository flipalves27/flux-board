import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { deriveEffectiveRoles } from "@/lib/rbac";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { FluxyMessageCreateSchema, zodErrorToMessage } from "@/lib/schemas";
import { createFluxyMessage, listFluxyMessages } from "@/lib/kv-fluxy-messages";
import { publishFluxyMessageCreated, subscribeFluxyCardMessages } from "@/lib/fluxy-message-stream";
import { finalizeFluxyMessageSideEffects, prepareFluxyMessageMentions } from "@/lib/fluxy-message-post";

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
  const enriched = await prepareFluxyMessageMentions({
    orgId: payload.orgId,
    boardId,
    body: parsed.data.body,
    relatedCardId: cardId,
    clientMentions: parsed.data.mentions,
  });
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
    mediatedByFluxy: parsed.data.mediatedByFluxy ?? false,
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

  return NextResponse.json({ message, mentionMeta: { unresolvedTokens: enriched.unresolvedTokens } }, { status: 201 });
}
