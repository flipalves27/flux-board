import { NextRequest, NextResponse } from "next/server";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

/**
 * Eventos Slack (JSON) — URL verification para instalar o app.
 * Slash commands devem apontar para `/api/integrations/slack/commands`.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({
    key: `integrations:slack:events:${ip}`,
    limit: Number(process.env.FLUX_RL_SLACK_EVENTS_PER_MIN || 120),
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const raw = await request.text();
  let body: { type?: string; challenge?: string };
  try {
    body = JSON.parse(raw) as { type?: string; challenge?: string };
  } catch {
    body = {};
  }

  if (body?.type === "url_verification" && typeof body.challenge === "string") {
    return NextResponse.json({ challenge: body.challenge });
  }

  return NextResponse.json({
    ok: true,
    ignored: true,
    hint: "Configure slash commands em /api/integrations/slack/commands e notificações via Flux API.",
  });
}
