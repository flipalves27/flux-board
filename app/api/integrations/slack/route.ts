import { NextRequest, NextResponse } from "next/server";

/**
 * Eventos Slack (JSON) — URL verification para instalar o app.
 * Slash commands devem apontar para `/api/integrations/slack/commands`.
 */
export async function POST(request: NextRequest) {
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
