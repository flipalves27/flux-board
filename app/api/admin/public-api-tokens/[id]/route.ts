import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import { revokePublicApiToken, rotatePublicApiToken } from "@/lib/public-api-tokens";
import { insertAuditEvent } from "@/lib/audit-events";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const { id } = await params;
  const rotated = await rotatePublicApiToken(id);
  if (!rotated) return NextResponse.json({ error: "Token não encontrado." }, { status: 404 });
  await insertAuditEvent({
    action: "public_api_token_rotated",
    resourceType: "platform",
    actorUserId: payload.id,
    orgId: rotated.token.orgId,
    resourceId: rotated.token._id,
    route: `/api/admin/public-api-tokens/${id}`,
    metadata: {
      name: rotated.token.name,
      scopes: rotated.token.scopes,
    },
  });
  return NextResponse.json({
    token: {
      id: rotated.token._id,
      name: rotated.token.name,
      orgId: rotated.token.orgId,
      keyPrefix: rotated.token.keyPrefix,
      scopes: rotated.token.scopes,
      active: rotated.token.active,
      createdAt: rotated.token.createdAt,
      updatedAt: rotated.token.updatedAt,
      rotatedAt: rotated.token.rotatedAt ?? null,
      revokedAt: rotated.token.revokedAt ?? null,
    },
    rawKey: rotated.rawKey,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const { id } = await params;
  const ok = await revokePublicApiToken(id);
  if (!ok) return NextResponse.json({ error: "Token não encontrado." }, { status: 404 });
  await insertAuditEvent({
    action: "public_api_token_revoked",
    resourceType: "platform",
    actorUserId: payload.id,
    resourceId: id,
    route: `/api/admin/public-api-tokens/${id}`,
    metadata: {},
  });
  return NextResponse.json({ ok: true });
}

