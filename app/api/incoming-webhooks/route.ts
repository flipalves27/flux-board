import { NextRequest, NextResponse } from "next/server";
import { getBoard, updateBoard } from "@/lib/kv-boards";
import {
  detectWebhookSource,
  routeIncomingWebhook,
} from "@/lib/incoming-webhook-handlers";
import { rateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { ensureNoWebhookReplay, verifyIncomingWebhookSignature } from "@/lib/incoming-webhook-security";

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-webhook-token");
  const boardId = request.headers.get("x-board-id") ?? request.nextUrl.searchParams.get("boardId");
  const orgId = request.headers.get("x-org-id") ?? request.nextUrl.searchParams.get("orgId");
  const webhookTs = request.headers.get("x-webhook-timestamp");
  const webhookSig = request.headers.get("x-webhook-signature");
  const webhookEventId = request.headers.get("x-webhook-id");
  const ip = getClientIpFromHeaders(request.headers);

  const rl = await rateLimit({
    key: `incoming-webhook:ip:${ip}:org:${orgId ?? "unknown"}`,
    limit: Number(process.env.FLUX_RL_INCOMING_WEBHOOK_PER_MIN || 60),
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições neste webhook. Tente novamente em instantes.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  if ((!token && (!webhookTs || !webhookSig)) || !boardId || !orgId) {
    return NextResponse.json(
      { error: "Missing auth (token or signature), boardId, or orgId" },
      { status: 400 }
    );
  }

  const board = await getBoard(boardId, orgId);
  if (!board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const webhookConfig = (board as unknown as Record<string, unknown>).incomingWebhookToken;
  if (typeof webhookConfig !== "string" || webhookConfig.length < 8) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 403 });
  }

  const rawBody = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (webhookTs || webhookSig) {
    const sig = verifyIncomingWebhookSignature({
      payload: rawBody,
      timestamp: webhookTs,
      signature: webhookSig,
      secret: webhookConfig,
    });
    if (!sig.ok) {
      return NextResponse.json({ error: "Invalid webhook signature", code: sig.reason }, { status: 403 });
    }
    const replay = await ensureNoWebhookReplay({
      orgId,
      boardId,
      timestamp: webhookTs as string,
      eventId: webhookEventId,
    });
    if (!replay.ok) {
      return NextResponse.json({ error: "Webhook replay detected", code: replay.reason }, { status: 409 });
    }
  } else if (token !== webhookConfig) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  const rawHeaders: Record<string, string> = {};
  request.headers.forEach((v, k) => { rawHeaders[k.toLowerCase()] = v; });

  const source = detectWebhookSource(rawHeaders, body);
  const action = routeIncomingWebhook(source, rawHeaders, body);

  if (!action) {
    return NextResponse.json({ ok: true, processed: false, reason: "unrecognized_event" });
  }

  if (action.action === "create") {
    const cards = Array.isArray(board.cards) ? [...board.cards] : [];
    const maxId = cards.reduce((max: number, raw: unknown) => {
      const c = raw as Record<string, unknown>;
      const n = parseInt(String(c.id || "0").replace(/\D/g, ""), 10);
      return n > max ? n : max;
    }, 0);

    const bucketOrder = Array.isArray(board.config?.bucketOrder) ? board.config.bucketOrder : [];
    const firstBucket = bucketOrder[0] as Record<string, unknown> | undefined;
    const bucket = action.targetColumn ?? String(firstBucket?.key ?? firstBucket?.label ?? "Backlog");

    const newCard = {
      id: `c${maxId + 1}`,
      title: action.title ?? "Novo card (webhook)",
      desc: action.description ?? "",
      bucket,
      priority: action.priority ?? "Média",
      progress: "Não iniciado",
      tags: action.tags ?? [],
      direction: null,
      dueDate: null,
      assigneeId: (board as any).config?.cardRules?.requireAssignee ? String((board as any).ownerId || "") : null,
      order: cards.filter((raw) => (raw as Record<string, unknown>).bucket === bucket).length,
      links: action.externalRef ? [{ url: action.externalRef, label: source }] : [],
    };

    cards.push(newCard);
    await updateBoard(boardId, orgId, { ...board, cards } as typeof board);

    return NextResponse.json({ ok: true, processed: true, cardId: newCard.id, source });
  }

  return NextResponse.json({ ok: true, processed: false, reason: "action_not_implemented" });
}
