import { NextRequest, NextResponse } from "next/server";

/** Placeholder Microsoft Teams / Bot Framework — espelha o contrato JSON básico. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (body?.type === "message" && body?.text) {
    return NextResponse.json({
      type: "message",
      text: "Flux-Board Teams bridge (stub). Conecte o Bot Framework às rotas Flux com credencial de serviço.",
    });
  }
  return NextResponse.json({ type: "message", text: "Flux-Board Teams — endpoint ativo (stub)." });
}
