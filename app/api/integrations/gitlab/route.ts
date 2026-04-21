import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrgManager } from "@/lib/api-authz";
import { getIntegrationConnection, upsertIntegrationConnection } from "@/lib/kv-integrations";

export const runtime = "nodejs";

const BodySchema = z.object({
  status: z.enum(["connected", "disconnected"]),
  accountLabel: z.string().trim().max(120).optional(),
  externalOrgId: z.string().trim().max(120).optional(),
  webhookSecret: z.string().trim().min(8).max(200).optional(),
});

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  const connection = await getIntegrationConnection(payload.orgId, "gitlab");
  return NextResponse.json({ connection });
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const connection = await upsertIntegrationConnection({
    orgId: payload.orgId,
    provider: "gitlab",
    ...parsed.data,
  });
  return NextResponse.json({ connection });
}

