import { NextRequest, NextResponse } from "next/server";

/**
 * Slash commands Slack (`application/x-www-form-urlencoded`).
 * Produção: validar assinatura com `SLACK_SIGNING_SECRET` e chamar Flux API com credencial de serviço.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const command = String(form.get("command") || "");
  const text = String(form.get("text") || "").trim();

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
