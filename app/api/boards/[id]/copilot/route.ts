import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { parseCopilotChatInput } from "./input-schema";
import { createCopilotSseStream } from "./stream";
import { enforceCopilotGetPolicy, enforceCopilotPostPolicy } from "./policy";
import type { CopilotAuthPayload } from "./types";
import { COPILOT_SSE_HEADERS, FREE_DEMO_MESSAGES_LIMIT } from "./config";
import { copilotError, parseBoardIdOrError } from "./route-helpers";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return copilotError("Não autenticado", 401);
  }

  const { id: boardId } = await params;
  const boardIdParsed = parseBoardIdOrError(boardId);
  if (!boardIdParsed.ok) return boardIdParsed.response;

  const policy = await enforceCopilotGetPolicy({ payload: payload as CopilotAuthPayload, boardId: boardIdParsed.boardId });
  if (!policy.ok) return policy.response;
  const { tier, chat } = policy.data;
  const freeRemaining = tier === "free" ? Math.max(0, FREE_DEMO_MESSAGES_LIMIT - chat.freeDemoUsed) : null;

  return NextResponse.json({
    tier,
    freeDemoRemaining: freeRemaining,
    messages: chat.messages.slice(-60),
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return copilotError("Não autenticado", 401);
  }

  const { id: boardId } = await params;
  const boardIdParsed = parseBoardIdOrError(boardId);
  if (!boardIdParsed.ok) return boardIdParsed.response;

  const rawBody = await request.json().catch(() => ({}));
  const input = parseCopilotChatInput(rawBody);
  if (!input.ok) return copilotError(input.error, 400);
  const { debugRag, userMessage } = input.data;

  const policy = await enforceCopilotPostPolicy({ payload: payload as CopilotAuthPayload, boardId: boardIdParsed.boardId });
  if (!policy.ok) return policy.response;
  const { org, gateCtx, tier, board, chat } = policy.data;

  const stream = createCopilotSseStream({
    payload: {
      id: payload.id,
      username: payload.username,
      orgId: payload.orgId,
      isAdmin: payload.isAdmin,
      orgRole: payload.orgRole,
    },
    boardId: boardIdParsed.boardId,
    board,
    chat,
    debugRag,
    userMessage,
    tier,
    org,
    gateCtx,
  });

  return new NextResponse(stream, {
    headers: COPILOT_SSE_HEADERS,
  });
}

