import { NextRequest, NextResponse } from "next/server";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

/** Placeholder Microsoft Teams / Bot Framework — espelha o contrato JSON básico. */
export async function POST(request: NextRequest) {
  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({
    key: `integrations:teams:${ip}`,
    limit: Number(process.env.FLUX_RL_TEAMS_WEBHOOK_PER_MIN || 120),
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (body?.type === "message" && body?.text) {
    return NextResponse.json({
      type: "message",
      text: "Flux-Board Teams bridge (stub). Conecte o Bot Framework às rotas Flux com credencial de serviço.",
    });
  }
  return NextResponse.json({ type: "message", text: "Flux-Board Teams — endpoint ativo (stub)." });
}
