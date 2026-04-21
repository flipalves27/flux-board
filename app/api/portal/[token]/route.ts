import { NextRequest, NextResponse } from "next/server";
import { getBoard, type BoardData } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getPortalIndexByToken } from "@/lib/kv-portal";
import { buildPublicPortalPayload } from "@/lib/portal-public";
import type { BoardPortalSettings } from "@/lib/portal-types";
import { PORTAL_COOKIE_NAME, verifyPortalSessionToken } from "@/lib/portal-session";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

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

  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({
    key: `portal:get:${token.slice(0, 48)}:${ip}`,
    limit: Number(process.env.FLUX_RL_PORTAL_GET_PER_MIN || 120),
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
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
