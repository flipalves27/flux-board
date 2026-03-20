import { NextRequest, NextResponse } from "next/server";
import { getBoard, type BoardData } from "@/lib/kv-boards";
import { getPortalIndexByToken } from "@/lib/kv-portal";
import { buildPublicPortalPayload } from "@/lib/portal-public";
import type { BoardPortalSettings } from "@/lib/portal-types";
import { PORTAL_COOKIE_NAME, verifyPortalSessionToken } from "@/lib/portal-session";

function lockedPreview(board: BoardData, portal: BoardPortalSettings) {
  const p = buildPublicPortalPayload(board, portal);
  return {
    boardName: p.boardName,
    clientLabel: p.clientLabel,
    branding: p.branding,
    displayTitle: p.branding.title || p.boardName,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Token inválido." }, { status: 400 });
  }

  const index = await getPortalIndexByToken(token);
  if (!index || !index.enabled) {
    return NextResponse.json({ error: "Portal não encontrado." }, { status: 404 });
  }

  const board = await getBoard(index.boardId, index.orgId);
  const portal = board?.portal;
  if (!board || !portal?.enabled || portal.token !== token) {
    return NextResponse.json({ error: "Portal não encontrado." }, { status: 404 });
  }

  const cookie = request.cookies.get(PORTAL_COOKIE_NAME)?.value;
  const unlocked = portal.passwordHash ? verifyPortalSessionToken(cookie, token) : true;

  if (!unlocked) {
    return NextResponse.json({
      locked: true,
      passwordProtected: true,
      preview: lockedPreview(board, portal),
    });
  }

  return NextResponse.json({
    locked: false,
    passwordProtected: Boolean(portal.passwordHash),
    payload: buildPublicPortalPayload(board, portal),
  });
}
