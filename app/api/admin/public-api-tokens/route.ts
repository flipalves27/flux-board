import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import { createPublicApiToken, listPublicApiTokens } from "@/lib/public-api-tokens";
import type { PublicApiScope } from "@/lib/public-api-auth";
import { insertAuditEvent } from "@/lib/audit-events";

const ScopeEnum = z.enum([
  "boards:read",
  "boards:write",
  "cards:read",
  "cards:write",
  "sprints:read",
  "sprints:write",
  "comments:read",
  "comments:write",
]);

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  orgId: z.string().trim().min(1).max(120),
  scopes: z.array(ScopeEnum).min(1).max(20),
});

function toPublic(token: Awaited<ReturnType<typeof listPublicApiTokens>>[number]) {
  return {
    id: token._id,
    name: token.name,
    orgId: token.orgId,
    keyPrefix: token.keyPrefix,
    scopes: token.scopes,
    active: token.active,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
    rotatedAt: token.rotatedAt ?? null,
    revokedAt: token.revokedAt ?? null,
  };
}

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const tokens = await listPublicApiTokens();
  return NextResponse.json({ tokens: tokens.map(toPublic) });
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const created = await createPublicApiToken({
    name: parsed.data.name,
    orgId: parsed.data.orgId,
    scopes: parsed.data.scopes as PublicApiScope[],
  });
  await insertAuditEvent({
    action: "public_api_token_created",
    resourceType: "platform",
    actorUserId: payload.id,
    orgId: created.token.orgId,
    resourceId: created.token._id,
    route: "/api/admin/public-api-tokens",
    metadata: {
      name: created.token.name,
      scopes: created.token.scopes,
    },
  });
  return NextResponse.json(
    {
      token: toPublic(created.token),
      rawKey: created.rawKey,
    },
    { status: 201 }
  );
}

