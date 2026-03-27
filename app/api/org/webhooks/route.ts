import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrgManager } from "@/lib/api-authz";
import { createWebhookSubscription, listWebhookSubscriptions } from "@/lib/kv-webhooks";
import { WebhookSubscriptionCreateSchema, zodErrorToMessage } from "@/lib/schemas";
import { assertWebhookUrlAllowed } from "@/lib/webhook-url";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const deniedGet = ensureOrgManager(payload);
  if (deniedGet) return deniedGet;

  const subs = await listWebhookSubscriptions(payload.orgId);
  return NextResponse.json({ webhooks: subs });
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const deniedPost = ensureOrgManager(payload);
  if (deniedPost) return deniedPost;

  const body = await request.json().catch(() => ({}));
  const parsed = WebhookSubscriptionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  }

  try {
    assertWebhookUrlAllowed(parsed.data.url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "URL inválida" }, { status: 400 });
  }

  const { subscription, secret } = await createWebhookSubscription({
    orgId: payload.orgId,
    url: parsed.data.url,
    secret: parsed.data.secret,
    events: parsed.data.events,
    active: parsed.data.active,
  });

  const { secret: _s, ...rest } = subscription;
  return NextResponse.json({
    webhook: { ...rest, secretHint: `****${subscription.secret.slice(-4)}` },
    /** Exibido apenas na criação (rotação via PATCH). */
    secret,
  });
}
