import { NextRequest, NextResponse } from "next/server";
import { verifySlackRequestSignature } from "@/lib/slack-request-verify";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

/**
 * Slash commands Slack (`application/x-www-form-urlencoded`).
 * Exige `SLACK_SIGNING_SECRET` e assinatura válida; sem secret a rota responde 404 (sem expor stub).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!secret) {
    return new NextResponse(null, { status: 404 });
  }

  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({
    key: `integrations:slack:commands:${ip}`,
    limit: Number(process.env.FLUX_RL_SLACK_COMMANDS_PER_MIN || 120),
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }

  const rawBody = await request.text();
  const verified = verifySlackRequestSignature({
    signingSecret: secret,
    rawBody,
    timestampHeader: request.headers.get("x-slack-request-timestamp"),
    signatureHeader: request.headers.get("x-slack-signature"),
  });
  if (!verified) {
    return new NextResponse(null, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const command = String(params.get("command") || "");
  const text = String(params.get("text") || "").trim();

  if (command !== "/flux" && command !== "/flux-board") {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Comando não reconhecido. Use `/flux status`, `/flux create \"…\" em Pipeline`, `/flux brief`.",
    });
  }

  const parts = text.split(/\s+/).filter(Boolean);
  const sub = (parts[0] || "").toLowerCase();

  if (sub === "status") {
    const pipeline = parts.slice(1).join(" ") || "(pipeline padrão)";
    return NextResponse.json({
      response_type: "in_channel",
      text: `📊 *Flux status* (stub) — pipeline: *${pipeline}*\nConecte o bot ao tenant e token de serviço para dados reais.`,
    });
  }

  if (sub === "brief") {
    return NextResponse.json({
      response_type: "in_channel",
      text: "📌 *Flux brief* (stub) — resumo diário, atrasos e automações. Implemente chamada à API de relatórios.",
    });
  }

  if (sub === "create") {
    return NextResponse.json({
      response_type: "in_channel",
      text: "➕ *Flux create* recebido (stub). Parseie título/pipeline e chame `POST /api/boards` com JWT de serviço.",
    });
  }

  return NextResponse.json({
    response_type: "ephemeral",
    text: "Subcomandos: `status [Pipeline]`, `create \"título\" em Pipeline`, `brief`.",
  });
}
