import { NextRequest, NextResponse } from "next/server";
import { getBoard, updateBoard } from "@/lib/kv-boards";
import {
  detectWebhookSource,
  routeIncomingWebhook,
} from "@/lib/incoming-webhook-handlers";

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-webhook-token") ?? request.nextUrl.searchParams.get("token");
  const boardId = request.headers.get("x-board-id") ?? request.nextUrl.searchParams.get("boardId");
  const orgId = request.headers.get("x-org-id") ?? request.nextUrl.searchParams.get("orgId");

  if (!token || !boardId || !orgId) {
    return NextResponse.json({ error: "Missing token, boardId, or orgId" }, { status: 400 });
  }

  const board = await getBoard(boardId, orgId);
  if (!board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const webhookConfig = (board as Record<string, unknown>).incomingWebhookToken;
  if (typeof webhookConfig !== "string" || webhookConfig !== token) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
    const maxId = cards.reduce((max: number, c: Record<string, unknown>) => {
      const n = parseInt(String(c.id || "0").replace(/\D/g, ""), 10);
      return n > max ? n : max;
    }, 0);

    const config = (board.config ?? {}) as Record<string, unknown>;
    const columns = Array.isArray(config.columns) ? config.columns : [];
    const firstCol = columns[0] as Record<string, unknown> | undefined;
    const bucket = action.targetColumn ?? String(firstCol?.key ?? firstCol?.label ?? "Backlog");

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
      order: cards.filter((c: Record<string, unknown>) => c.bucket === bucket).length,
      links: action.externalRef ? [{ url: action.externalRef, label: source }] : [],
    };

    cards.push(newCard);
    await updateBoard(boardId, orgId, { ...board, cards } as typeof board);

    return NextResponse.json({ ok: true, processed: true, cardId: newCard.id, source });
  }

  return NextResponse.json({ ok: true, processed: false, reason: "action_not_implemented" });
}
