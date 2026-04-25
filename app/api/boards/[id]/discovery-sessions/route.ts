import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { isDiscoveryMethodology } from "@/lib/board-methodology";
import {
  createDiscoverySession,
  discoveryPublicShareUrl,
  listDiscoverySessionsForBoard,
  type DiscoverySession,
} from "@/lib/kv-discovery-sessions";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { routing } from "@/i18n";

function stripSession(s: DiscoverySession): Omit<DiscoverySession, "tokenHash"> {
  const { tokenHash: _t, ...rest } = s;
  return rest;
}

function resolveOrigin(request: NextRequest): string {
  const u = request.nextUrl;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || u.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || (u.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para o board." }, { status: 403 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });
  if (!isDiscoveryMethodology(board.boardMethodology)) {
    return NextResponse.json({ error: "Sessões de discovery só em boards com metodologia Discovery." }, { status: 400 });
  }

  try {
    const sessions = await listDiscoverySessionsForBoard(payload.orgId, boardId);
    return NextResponse.json({
      sessions: sessions.map((s) => stripSession(s)),
    });
  } catch (err) {
    return publicApiErrorResponse(err, { context: "GET discovery-sessions" });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para o board." }, { status: 403 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });
  if (!isDiscoveryMethodology(board.boardMethodology)) {
    return NextResponse.json({ error: "Sessões de discovery só em boards com metodologia Discovery." }, { status: 400 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { expiresAt?: unknown; locale?: unknown };
    const expiresAt = typeof body.expiresAt === "string" && body.expiresAt.trim() ? body.expiresAt.trim() : undefined;
    const locRaw = typeof body.locale === "string" ? body.locale.trim() : "";
    const locale = routing.locales.includes(locRaw as (typeof routing.locales)[number]) ? locRaw : routing.defaultLocale;

    const { session, plainToken } = await createDiscoverySession({
      orgId: payload.orgId,
      boardId,
      createdByUserId: payload.id,
      boardTitleSnapshot: String(board.name || "").trim(),
      ...(expiresAt ? { expiresAt } : {}),
    });

    const origin = resolveOrigin(request);
    const shareUrl = discoveryPublicShareUrl(origin, locale, plainToken);

    return NextResponse.json({
      session: stripSession(session),
      shareUrl,
      /** @deprecated use shareUrl */
      plainToken,
    });
  } catch (err) {
    return publicApiErrorResponse(err, { context: "POST discovery-sessions" });
  }
}
