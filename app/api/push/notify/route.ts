import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrgManager } from "@/lib/api-authz";
import { enqueuePushOutbox, listPushSubscriptionsForOrg } from "@/lib/kv-push-subscriptions";

const BodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(300).optional(),
  url: z.string().trim().max(500).optional(),
  kind: z.enum(["mentions", "due_dates", "blocked_cards"]).optional().default("mentions"),
});

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const subs = await listPushSubscriptionsForOrg(payload.orgId, 1000);
  const eligible = subs.filter((s) => s.preferences[parsed.data.kind] !== false);
  let enqueued = 0;
  for (const sub of eligible) {
    await enqueuePushOutbox({
      orgId: payload.orgId,
      userId: sub.userId,
      endpoint: sub.endpoint,
      payload: {
        title: parsed.data.title,
        body: parsed.data.body,
        url: parsed.data.url,
      },
      nextAttemptAt: new Date().toISOString(),
    });
    enqueued += 1;
  }
  return NextResponse.json({ ok: true, enqueued });
}

