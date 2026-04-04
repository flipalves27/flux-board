import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { deletePushSubscription, listPushSubscriptions, upsertPushSubscription } from "@/lib/kv-push-subscriptions";

export const runtime = "nodejs";

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z
    .object({
      p256dh: z.string().optional(),
      auth: z.string().optional(),
    })
    .optional(),
  preferences: z
    .object({
      mentions: z.boolean().optional(),
      due_dates: z.boolean().optional(),
      blocked_cards: z.boolean().optional(),
    })
    .optional(),
});

const DeleteSchema = z.object({
  endpoint: z.string().url(),
});

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const subscriptions = await listPushSubscriptions(payload.orgId, payload.id);
  return NextResponse.json({ subscriptions });
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = SubscriptionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });

  const subscription = await upsertPushSubscription({
    orgId: payload.orgId,
    userId: payload.id,
    ...parsed.data,
  });
  return NextResponse.json({ subscription });
}

export async function DELETE(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });

  const removed = await deletePushSubscription(payload.orgId, payload.id, parsed.data.endpoint);
  return NextResponse.json({ ok: removed });
}

