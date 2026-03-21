import { NextRequest, NextResponse } from "next/server";
import { getBoard, type BoardData } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getPortalIndexByToken } from "@/lib/kv-portal";
import { buildPublicPortalPayload } from "@/lib/portal-public";
import type { BoardPortalSettings } from "@/lib/portal-types";
import { PORTAL_COOKIE_NAME, verifyPortalSessionToken } from "@/lib/portal-session";

async function lockedPreview(board: BoardData, portal: BoardPortalSettings, orgId: string) {
  const org = await getOrganizationById(orgId);
  const p = buildPublicPortalPayload(board, portal, org?.branding, org?.name);
  return {
    boardName: p.boardName,
    clientLabel: p.clientLabel,
    branding: p.branding,
    displayTitle: p.branding.title || p.boardName,
    platformName: p.platformName,
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
      preview: await lockedPreview(board, portal, index.orgId),
    });
  }

  const org = await getOrganizationById(index.orgId);

  return NextResponse.json({
    locked: false,
    passwordProtected: Boolean(portal.passwordHash),
    payload: buildPublicPortalPayload(board, portal, org?.branding, org?.name),
  });
}
