import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrgManager } from "@/lib/api-authz";
import {
  deleteWebhookSubscription,
  getWebhookSubscription,
  updateWebhookSubscription,
} from "@/lib/kv-webhooks";
import { WebhookSubscriptionUpdateSchema, zodErrorToMessage } from "@/lib/schemas";
import { assertWebhookUrlAllowed } from "@/lib/webhook-url";

function secretHint(secret: string): string {
  const s = String(secret || "");
  return s.length <= 4 ? "****" : `****${s.slice(-4)}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(_request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const deniedGet = ensureOrgManager(payload);
  if (deniedGet) return deniedGet;

  const { id } = await params;
  const sub = await getWebhookSubscription(payload.orgId, id);
  if (!sub) return NextResponse.json({ error: "Webhook não encontrado" }, { status: 404 });

  const { secret, ...rest } = sub;
  return NextResponse.json({ webhook: { ...rest, secretHint: secretHint(secret) } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const deniedPatch = ensureOrgManager(payload);
  if (deniedPatch) return deniedPatch;

  const { id } = await params;
  const existing = await getWebhookSubscription(payload.orgId, id);
  if (!existing) return NextResponse.json({ error: "Webhook não encontrado" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = WebhookSubscriptionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  }

  if (parsed.data.url) {
    try {
      assertWebhookUrlAllowed(parsed.data.url);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "URL inválida" }, { status: 400 });
    }
  }

  const next = await updateWebhookSubscription(payload.orgId, id, {
    ...(parsed.data.url !== undefined ? { url: parsed.data.url } : {}),
    ...(parsed.data.events !== undefined ? { events: parsed.data.events } : {}),
    ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    ...(parsed.data.secret !== undefined ? { secret: parsed.data.secret } : {}),
  });

  if (!next) return NextResponse.json({ error: "Webhook não encontrado" }, { status: 404 });

  const { secret, ...rest } = next;
  return NextResponse.json({
    webhook: { ...rest, secretHint: secretHint(secret) },
    ...(parsed.data.secret ? { secret: parsed.data.secret } : {}),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(_request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const deniedDel = ensureOrgManager(payload);
  if (deniedDel) return deniedDel;

  const { id } = await params;
  const ok = await deleteWebhookSubscription(payload.orgId, id);
  if (!ok) return NextResponse.json({ error: "Webhook não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
